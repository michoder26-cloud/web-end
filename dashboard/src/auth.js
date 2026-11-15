import '@fontsource-variable/inter-tight'
import './auth.css'

const status = document.querySelector('.status')
const messages = {
  'not-configured': 'Google sign-in is not switched on yet. Please try again later.',
  'cancelled': 'Sign-in was cancelled.',
  'expired': 'That sign-in took too long or was already used. Please try again.',
  'failed': 'Google could not confirm your sign-in. Please try again.',
  'busy': 'Too many sign-in attempts from your network. Please wait an hour and try again.',
}
const error = new URLSearchParams(location.search).get('error')
if (error && messages[error]) {
  status.textContent = messages[error]
  status.hidden = false
}

// Someone who is already signed in goes straight to their account.
fetch('/api/me', { credentials: 'same-origin' })
  .then((response) => { if (response.ok) location.replace('/account/') })
  .catch(() => {})
