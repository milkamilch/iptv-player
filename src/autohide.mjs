// Auto-hide for the player bar: visible on activity, hidden after delayMs without any,
// never hidden while held (pointer rests on the bar). onChange fires only on real changes.
export const PLAYER_BAR_IDLE_MS = 3000;

export function createAutoHide({ delayMs, onChange }) {
  let visible = true;
  let held = false;
  let timer = null;

  function show() {
    if (!visible) { visible = true; onChange(true); }
  }

  function arm() {
    timer = setTimeout(() => {
      timer = null;
      visible = false;
      onChange(false);
    }, delayMs);
  }

  return {
    activity() {
      clearTimeout(timer);
      show();
      if (!held) arm();
    },
    hold() {
      held = true;
      clearTimeout(timer);
      show();
    },
    release() {
      held = false;
      clearTimeout(timer);
      arm();
    },
    dispose() {
      clearTimeout(timer);
      timer = null;
    },
  };
}
