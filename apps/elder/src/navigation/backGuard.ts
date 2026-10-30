// The Android hardware back button.
//
// React Navigation's native stack handles the hardware back press itself, but only while a
// navigation container is mounted and only when the press reaches it. Two things go wrong
// without an explicit handler:
//
//   * on the root screen there is nothing to pop, so the press falls through to Android, which
//     closes the activity. An older adult who taps back once — the most reflexive gesture
//     there is — exits HAVEN mid-sentence, mid-form, mid-anything;
//   * while the voice button is recording, an accidental back press destroys a 60-second
//     recording that cannot be recovered.
//
// So the handler is registered explicitly and returns true for every press it consumes: pop if
// there is somewhere to pop to, otherwise stay put. Staying put is the deliberate choice —
// there is no "are you sure you want to leave" dialog, because for this audience an app that
// will not close is much less harmful than one that closes by accident.

export interface BackNavigation {
  canGoBack: () => boolean;
  goBack: () => void;
}

export interface BackSubscription {
  remove: () => void;
}

/** The slice of react-native's BackHandler this needs. */
export interface BackHandlerLike {
  addEventListener: (event: 'hardwareBackPress', handler: () => boolean) => BackSubscription;
}

/**
 * Registers the hardware back handler. Returns the unsubscribe function.
 *
 * Returns true from the handler in both branches — consumed either way — so Android never
 * performs its default "finish the activity" action.
 */
export function attachBackGuard(
  backHandler: BackHandlerLike,
  navigation: BackNavigation,
  onConsumed?: () => void,
): () => void {
  const subscription = backHandler.addEventListener('hardwareBackPress', () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      onConsumed?.();
    }
    return true;
  });
  return () => subscription.remove();
}
