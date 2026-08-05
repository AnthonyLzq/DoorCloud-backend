import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import {
  createSetupController,
  MAX_POLLS
} from '../controller/setup-controller'
import { api } from '../instance'

// Setup view (WF-1..6): page-load status check, Start with double-start
// guard, auto-poll up to 20 status checks, auto-QR, manual recovery via
// "Load QR" and "Refresh status", plus the OpenWA config form that the SPA
// absorbed from the old renderSetupHtml page.
export const Setup = (): JSX.Element => {
  const [controller] = useState(() =>
    createSetupController({
      api: {
        getStatus: api.getSetupStatus,
        start: api.startSetupSession,
        getQr: api.getSetupQr
      },
      setTimeout,
      clearTimeout
    })
  )
  const [chatId, setChatId] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [formMessage, setFormMessage] = useState('')

  const { phase, status, qrCode, error, polls } = controller.state.value
  const busy = phase === 'starting' || phase === 'polling'

  useEffect(() => {
    void controller.refreshStatus()

    return () => controller.dispose()
  }, [controller])

  useEffect(() => {
    if (status?.configuredChatId) setChatId(status.configuredChatId)
  }, [status?.configuredChatId])

  const saveConfig = async (): Promise<void> => {
    setFormMessage('')
    try {
      const result = await api.saveSetupConfig({
        ...(chatId.trim() ? { OPENWA_CHAT_ID: chatId.trim() } : {})
      })
      setFormMessage(`Saved: ${result.saved.join(', ')}`)
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : 'Failed to save config'
      )
    }
  }

  const sendTest = async (): Promise<void> => {
    setFormMessage('')
    try {
      await api.sendSetupTest({
        ...(imageUrl.trim() ? { imageUrl: imageUrl.trim() } : {})
      })
      setFormMessage('Test message sent')
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : 'Failed to send test'
      )
    }
  }

  return (
    <main>
      <h1>DoorCloud OpenWA setup</h1>
      <p>
        Start the configured OpenWA session, load the QR, scan it with WhatsApp,
        then send a test message.
      </p>

      <section class="card">
        <h2>Pairing</h2>

        {phase === 'starting' && <p>Starting session...</p>}
        {phase === 'polling' && (
          <p>
            Waiting for the QR code... ({polls}/{MAX_POLLS})
          </p>
        )}
        {phase === 'connected' && (
          <p>Connected as session {status?.session?.id ?? 'unknown'}.</p>
        )}
        {phase === 'waiting' && (
          <p>Still waiting for the QR code after {MAX_POLLS} checks.</p>
        )}
        {phase === 'error' && (
          <p class="error">
            {error ?? 'Something went wrong. Use the buttons below to recover.'}
          </p>
        )}

        {qrCode && <img class="qr" src={qrCode} alt="OpenWA sign-in QR" />}

        <p>
          <button
            type="button"
            disabled={busy || phase === 'connected'}
            onClick={controller.start}
          >
            Start session
          </button>
          <button type="button" class="secondary" onClick={controller.loadQr}>
            Load QR
          </button>
          <button
            type="button"
            class="secondary"
            onClick={controller.refreshStatus}
          >
            Refresh status
          </button>
        </p>

        {status && <pre>{JSON.stringify(status, null, 2)}</pre>}
      </section>

      <section class="card">
        <h2>Destination</h2>
        <label for="openwa-chat-id">WhatsApp chat ID</label>
        <input
          id="openwa-chat-id"
          type="text"
          placeholder="51999999999@c.us"
          value={chatId}
          onInput={event => setChatId(event.currentTarget.value)}
        />
        <p>
          <button type="button" onClick={saveConfig}>
            Save destination
          </button>
        </p>
      </section>

      <section class="card">
        <h2>Send test</h2>
        <label for="image-url">Optional public image URL</label>
        <input
          id="image-url"
          type="url"
          placeholder="https://example.com/image.jpg"
          value={imageUrl}
          onInput={event => setImageUrl(event.currentTarget.value)}
        />
        <p>
          <button type="button" onClick={sendTest}>
            Send test message
          </button>
        </p>
      </section>

      {formMessage && <p>{formMessage}</p>}
    </main>
  )
}
