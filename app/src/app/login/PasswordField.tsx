'use client';

import { useState } from 'react';

import styles from './PasswordField.module.css';

/** Passo puro del pulsante Mostra/Nascondi: inverte la visibilità. */
export function nextVisibility(current: boolean): boolean {
  return !current;
}

type PasswordFieldProps = {
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Campo password con pulsante Mostra/Nascondi. Lo stato vive solo in memoria React (nessuna persistenza) e cambia
 * soltanto l'attributo `type` dello stesso <input>: valore e focus restano. Senza JavaScript il campo resta password.
 */
export function PasswordField({ invalid, describedBy }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={styles.field}>
      <label htmlFor="password" className={`body ${styles.label}`}>
        Password
      </label>
      <div className={styles.row}>
        <input
          id="password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={200}
          className={styles.input}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className={`btn btn-secondary ${styles.toggle}`}
          aria-pressed={visible}
          aria-controls="password"
          aria-label={visible ? 'Nascondi password' : 'Mostra password'}
          onClick={() => setVisible(nextVisibility)}
        >
          {visible ? 'Nascondi' : 'Mostra'}
        </button>
      </div>
    </div>
  );
}
