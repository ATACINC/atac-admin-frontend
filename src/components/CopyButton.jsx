import { useEffect, useRef, useState } from 'react';

// Reusable copy-to-clipboard button.
//   <CopyButton text="0xabc..." label="Copy" />
//
// Falls back silently if clipboard API isn't available (e.g., insecure
// context or older browser).
export default function CopyButton({ text, label = 'Copy', title }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = async () => {
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(String(text));
      } else {
        // Best-effort fallback for non-secure contexts
        const ta = document.createElement('textarea');
        ta.value = String(text);
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[CopyButton] copy failed:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={title || (copied ? 'Copied' : 'Copy to clipboard')}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      style={{
        background: copied ? 'rgba(34, 166, 126, 0.10)' : 'rgba(201, 168, 76, 0.08)',
        color: copied ? 'var(--teal-2)' : 'var(--gold)',
        border: `1px solid ${copied ? 'rgba(34, 166, 126, 0.32)' : 'var(--border)'}`,
        borderRadius: 2,
        padding: '4px 10px',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      {copied ? '✓ Copied' : label}
    </button>
  );
}
