import { useState, useEffect, useRef, useCallback } from 'react';

const RESULT_CODES = {
  1032: 'You cancelled the payment',
  1037: 'Payment prompt timed out',
  2001: 'Wrong PIN entered',
  1: 'Insufficient M-Pesa balance',
};

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/mpesa';
const MAX_ATTEMPTS = 20;
const POLL_INTERVAL = 3000;

export default function MpesaCheckout({ amount, onSuccess, onFailure }) {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | polling | success | failed | timeout
  const [result, setResult] = useState(null);

  const intervalRef = useRef(null);
  const attemptsRef = useRef(0);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    attemptsRef.current = 0;
  }, []);

  useEffect(() => {
    return () => clearPolling();
  }, [clearPolling]);

  const normalizePhone = (value) => {
    let n = value.replace(/\s/g, '');
    if (n.startsWith('+254')) n = n.slice(1);
    if (n.startsWith('0')) n = '254' + n.slice(1);
    return n;
  };

  const validatePhone = (value) => {
    const normalized = normalizePhone(value);
    if (!/^254[71][0-9]{8}$/.test(normalized)) {
      return 'Enter a valid Kenyan phone number (07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, or 2547XXXXXXXX)';
    }
    return '';
  };

  const pollStatus = useCallback(
    (checkoutRequestId) => {
      attemptsRef.current = 0;
      intervalRef.current = setInterval(async () => {
        attemptsRef.current += 1;
        try {
          const res = await fetch(`${API_BASE}/status/${checkoutRequestId}`);
          const data = await res.json();
          if (data.status === 'SUCCESS' || data.status === 'FAILED') {
            clearPolling();
            setStatus(data.status);
            setResult(data);
            if (data.status === 'SUCCESS') {
              onSuccess?.(data);
            } else {
              const msg =
                RESULT_CODES[data.resultCode] || data.resultDesc || 'Payment failed';
              onFailure?.(msg);
            }
          }
        } catch {
          // keep polling on transient network errors
        }
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          clearPolling();
          setStatus('timeout');
          setResult(null);
          onFailure?.('Payment timed out. Please check your M-Pesa transactions.');
        }
      }, POLL_INTERVAL);
    },
    [clearPolling, onFailure, onSuccess]
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    const error = validatePhone(phone);
    setPhoneError(error);
    if (error) return;

    setStatus('sending');
    setResult(null);

    const normalized = normalizePhone(phone);
    try {
      const res = await fetch(`${API_BASE}/stkpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: normalized, amount }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus('failed');
        setResult(data);
        onFailure?.(data.error || 'STK push failed');
        return;
      }

      const checkoutRequestId = data.data?.CheckoutRequestId;
      if (!checkoutRequestId) {
        setStatus('failed');
        onFailure?.('No checkout request ID returned');
        return;
      }

      setStatus('polling');
      pollStatus(checkoutRequestId);
    } catch (err) {
      setStatus('failed');
      onFailure?.(err.message || 'Network error');
    }
  };

  const handleTryAgain = () => {
    setStatus('idle');
    setResult(null);
    setPhoneError('');
    clearPolling();
  };

  const friendlyResultCode = (code) => RESULT_CODES[code] || '';

  const isLoading = status === 'sending' || status === 'polling';

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.title}>Pay with M-Pesa</h2>

      {status === 'idle' && (
        <>
          <label style={styles.label}>Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="07XXXXXXXX"
            disabled={isLoading}
            style={styles.input}
          />
          {phoneError && <span style={styles.error}>{phoneError}</span>}
          <button
            type="submit"
            disabled={isLoading || !amount}
            style={styles.button(isLoading)}
          >
            {isLoading ? 'Sending...' : 'Pay with M-Pesa'}
          </button>
        </>
      )}

      {status === 'sending' && (
        <div style={styles.state}>
          <p style={styles.text}>Sending STK push to your phone...</p>
        </div>
      )}

      {status === 'polling' && (
        <div style={styles.state}>
          <p style={styles.text}>
            Waiting for you to enter your PIN on M-Pesa...
          </p>
        </div>
      )}

      {status === 'success' && (
        <div style={styles.stateSuccess}>
          <p style={styles.successText}>Payment successful!</p>
          {result?.receipt && (
            <p style={styles.receipt}>M-Pesa Receipt: {result.receipt}</p>
          )}
          <button
            type="button"
            onClick={handleTryAgain}
            style={styles.tryAgain}
          >
            Try again
          </button>
        </div>
      )}

      {(status === 'failed' || status === 'timeout') && (
        <div style={styles.stateFail}>
          <p style={styles.failText}>
            {status === 'timeout'
              ? 'Payment timed out.'
              : friendlyResultCode(result?.resultCode) ||
                  result?.resultDesc ||
                  'Payment failed'}
          </p>
          {status === 'timeout' && (
            <p style={styles.failHint}>
              Please check your M-Pesa transactions.
            </p>
          )}
          <button
            type="button"
            onClick={handleTryAgain}
            style={styles.tryAgain}
          >
            Try again
          </button>
        </div>
      )}
    </form>
  );
}

const styles = {
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '360px',
    margin: '0 auto',
    padding: '20px',
    border: '1px solid #e5e4e7',
    borderRadius: '12px',
    background: '#fff',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    color: '#08060d',
    textAlign: 'center',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#6b6375',
  },
  input: {
    padding: '10px 12px',
    fontSize: '16px',
    border: '1px solid #e5e4e7',
    borderRadius: '8px',
    outline: 'none',
  },
  error: {
    fontSize: '12px',
    color: '#dc2626',
    margin: 0,
  },
  button: (loading) => ({
    padding: '10px 14px',
    fontSize: '16px',
    fontWeight: 500,
    color: '#fff',
    background: loading ? '#9ca3af' : '#2563eb',
    border: 'none',
    borderRadius: '8px',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.7 : 1,
  }),
  state: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '20px',
    color: '#6b6375',
  },
  text: {
    margin: 0,
    fontSize: '15px',
    textAlign: 'center',
  },
  stateSuccess: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '24px',
    color: '#08060d',
    textAlign: 'center',
  },
  successText: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#16a34a',
  },
  receipt: {
    margin: 0,
    fontSize: '14px',
    color: '#6b6375',
  },
  stateFail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '24px',
    color: '#08060d',
    textAlign: 'center',
  },
  failText: {
    margin: 0,
    fontSize: '15px',
    color: '#dc2626',
  },
  failHint: {
    margin: 0,
    fontSize: '13px',
    color: '#6b6375',
  },
  tryAgain: {
    marginTop: '6px',
    padding: '8px 14px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#2563eb',
    background: 'transparent',
    border: '1px solid #2563eb',
    borderRadius: '6px',
    cursor: 'pointer',
  },
};
