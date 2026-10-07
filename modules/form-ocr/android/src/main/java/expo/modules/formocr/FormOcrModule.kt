package expo.modules.formocr

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * On-device text recognition with Google ML Kit. The Latin-script model is bundled in the app
 * (com.google.mlkit:text-recognition), so it works offline from the first launch and no image
 * or result ever leaves the device.
 */
class FormOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FormOcr")

    Constant("engine") { "google-mlkit" }

    /**
     * Recognizes text lines in the image at [uri] (a local file:// or content:// URI).
     * ML Kit has a single recognition mode, so [level] only matters on iOS; the JS side
     * sends smaller images for "fast". [languages] is ignored (the Latin model covers them).
     * Resolves `{ width, height, lines: [{ text, confidence, x, y, width, height }] }`
     * with boxes normalized to 0..1, origin top-left of the upright image.
     */
    AsyncFunction("recognize") { uri: String, _: String, _: List<String>, promise: Promise ->
      val context = appContext.reactContext
        ?: throw CodedException("ERR_OCR_CONTEXT", "The app isn't ready to read images yet.", null)

      val parsed = Uri.parse(uri)
      val local = when (parsed.scheme) {
        "file", "content" -> parsed
        null -> Uri.fromFile(File(uri))
        else -> throw CodedException("ERR_OCR_REMOTE", "Only local images can be read.", null)
      }

      val image = try {
        // Reads EXIF orientation and hands ML Kit an upright bitmap.
        InputImage.fromFilePath(context, local)
      } catch (e: Exception) {
        throw CodedException("ERR_OCR_IMAGE", "The image couldn't be opened.", e)
      }
      val rotated = image.rotationDegrees == 90 || image.rotationDegrees == 270
      val width = (if (rotated) image.height else image.width).toDouble()
      val height = (if (rotated) image.width else image.height).toDouble()

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { text ->
          val lines = text.textBlocks.flatMap { block ->
            block.lines.map { line ->
              val box = line.boundingBox
              mapOf(
                "text" to line.text,
                "confidence" to line.confidence.toDouble(),
                "x" to (box?.left ?: 0) / width,
                "y" to (box?.top ?: 0) / height,
                "width" to (box?.width() ?: 0) / width,
                "height" to (box?.height() ?: 0) / height,
              )
            }
          }
          promise.resolve(mapOf("width" to width, "height" to height, "lines" to lines))
        }
        .addOnFailureListener { e ->
          promise.reject(CodedException("ERR_OCR_FAILED", "Text recognition failed: ${e.message}", e))
        }
        .addOnCompleteListener {
          // Free the model's native resources after every scan.
          recognizer.close()
        }
    }
  }
}
