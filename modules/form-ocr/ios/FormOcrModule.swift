import ExpoModulesCore
import ImageIO
import UIKit
import Vision

/// On-device text recognition with Apple Vision (`VNRecognizeTextRequest`).
/// Nothing leaves the device: the image is read from a local file and processed by the OS.
public class FormOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FormOcr")

    Constant("engine") { "apple-vision" }

    /// Recognizes text lines in the image at `uri` (a local file:// URI).
    /// `level` is "accurate" (default for photos) or "fast" (for live camera frames later).
    /// Returns `{ width, height, lines: [{ text, confidence, x, y, width, height }] }`,
    /// with boxes normalized to 0…1 and the origin at the top-left of the upright image.
    AsyncFunction("recognize") { (uri: String, level: String, languages: [String]) throws -> [String: Any] in
      // Async functions run off the main thread, so the UI never waits on Vision.
      return try FormOcrModule.recognize(uri: uri, fast: level == "fast", languages: languages)
    }
  }

  static func recognize(uri: String, fast: Bool, languages: [String]) throws -> [String: Any] {
    let fileURL: URL
    if let url = URL(string: uri), url.isFileURL {
      fileURL = url
    } else if uri.hasPrefix("/") {
      fileURL = URL(fileURLWithPath: uri)
    } else {
      throw OcrException("Only local images can be read.")
    }
    guard
      let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
      throw OcrException("The image couldn't be opened.")
    }
    let orientation = imageOrientation(source)

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = fast ? .fast : .accurate
    // Language correction helps words but can "fix" numbers; keep it for accurate scans only.
    request.usesLanguageCorrection = !fast
    if !languages.isEmpty {
      request.recognitionLanguages = languages
    } else {
      // iOS 16+ (the module's minimum is 16.4).
      request.automaticallyDetectsLanguage = true
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw OcrException("Text recognition failed: \(error.localizedDescription)")
    }

    let lines: [[String: Any]] = (request.results ?? []).compactMap { observation in
      guard let candidate = observation.topCandidates(1).first else { return nil }
      let box = observation.boundingBox  // normalized, origin bottom-left
      return [
        "text": candidate.string,
        "confidence": Double(candidate.confidence),
        "x": Double(box.minX),
        "y": Double(1 - box.maxY),
        "width": Double(box.width),
        "height": Double(box.height),
      ]
    }

    // Report the size of the upright image (EXIF orientations 5–8 swap width and height).
    let rotated = orientation.rawValue >= 5
    return [
      "width": rotated ? cgImage.height : cgImage.width,
      "height": rotated ? cgImage.width : cgImage.height,
      "lines": lines,
    ]
  }

  /// EXIF orientation of the file so Vision reads rotated phone photos the right way up.
  static func imageOrientation(_ source: CGImageSource) -> CGImagePropertyOrientation {
    guard
      let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let raw = props[kCGImagePropertyOrientation] as? UInt32,
      let orientation = CGImagePropertyOrientation(rawValue: raw)
    else {
      return .up
    }
    return orientation
  }
}

final class OcrException: GenericException<String> {
  override var reason: String { param }
}
