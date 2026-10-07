import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { confirmAction } from '@/components/confirm';
import { goBack } from '@/components/nav';
import { SessionEditor } from '@/components/SessionEditor';
import { RestTimerBar, useRestActive } from '@/components/timers';
import { showToast } from '@/components/toast';
import { EmptyState, IconButton, Screen, StackHeader } from '@/components/ui';
import { CATEGORY_LABEL } from '@/domain/exercises';
import { goalFeedback } from '@/hooks/saveFeedback';
import { useToday, useUnits } from '@/hooks/today';
import { useStore } from '@/store/store';
import { colors } from '@/theme';

export default function EditSession() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const prefs = useUnits();
  const { sessions, updateSession, deleteSession } = useStore(
    useShallow((s) => ({ sessions: s.sessions, updateSession: s.updateSession, deleteSession: s.deleteSession })),
  );
  const session = sessions.find((s) => s.id === id);
  const [date, setDate] = useState(session?.date ?? today);
  const resting = useRestActive();

  if (!session) {
    return (
      <Screen header={<StackHeader title="Session" />}>
        <EmptyState icon="calendar-blank-outline" title="Session not found" body="It may have been deleted." />
      </Screen>
    );
  }

  return (
    <Screen
      footer={resting ? <RestTimerBar /> : undefined}
      header={
        <StackHeader
          title={`Edit ${CATEGORY_LABEL[session.category].toLowerCase()} session`}
          right={
            <IconButton
              icon="trash-can-outline"
              label="Delete session"
              color={colors.danger}
              onPress={() =>
                confirmAction('Delete session?', 'This removes it from your history, goals and challenges.', 'Delete', () => {
                  deleteSession(session.id);
                  showToast('Session deleted');
                  goBack();
                })
              }
            />
          }
        />
      }>
      <SessionEditor
        prefs={prefs}
        sessions={sessions}
        today={today}
        date={date}
        onDateChange={setDate}
        session={session}
        saveLabel="Save changes"
        onSave={(input) => {
          updateSession(session.id, input);
          showToast(goalFeedback(input, today, prefs).replace('Saved', 'Updated').replace('Session saved', 'Session updated'));
          goBack();
        }}
      />
    </Screen>
  );
}
