// Enhance string bindings only: numeric and color inputs must keep their own validators.
export function enhanceTextFields(controls) {
  if (!controls) return;
  const selector = '.tp-lblv_v > .tp-txtv:not(.tp-txtv-num) > input.tp-txtv_i';
  for (const input of controls.querySelectorAll(selector)) {
    const field = input.parentElement;
    let button = field.querySelector('.text-field-clear');
    if (!button) {
      const commit = event => {
        if (event.isComposing || input.disabled || input.readOnly) return;
        // Tweakpane listens for change. Commit typing without interrupting an IME session.
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      input.addEventListener('input', commit);
      input.addEventListener('compositionend', commit);

      button = input.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'text-field-clear';
      button.textContent = '×';
      const label = input.closest('.tp-lblv')?.querySelector('.tp-lblv_l')?.textContent.trim() || 'text field';
      button.setAttribute('aria-label', `Clear ${label}`);
      button.title = `Clear ${label}`;
      button.addEventListener('click', () => {
        if (input.disabled || input.readOnly) return;
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus({ preventScroll: true });
      });
      field.classList.add('has-text-clear');
      field.append(button);
    }
    button.disabled = input.disabled || input.readOnly;
  }
}
