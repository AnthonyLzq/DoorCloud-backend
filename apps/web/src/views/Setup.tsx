import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import type { Api } from '../api'
import {
  createSetupController,
  MAX_POLLS
} from '../controller/setup-controller'
import { api as defaultApi } from '../instance'

// Setup view (WF-1..6): page-load status check, Start with double-start
// guard, auto-poll up to 20 status checks, auto-QR, manual recovery via
// "Load QR" and "Refresh status", plus the OpenWA config form that the SPA
// absorbed from the old renderSetupHtml page.

// The subset of the API the Setup view drives; typed separately from the
// full Api so tests can inject a fake without stubbing admin methods.
export interface SetupViewApi {
  getSetupStatus: Api['getSetupStatus']
  startSetupSession: Api['startSetupSession']
  getSetupQr: Api['getSetupQr']
  saveSetupConfig: Api['saveSetupConfig']
  sendSetupTest: Api['sendSetupTest']
}

export interface SetupProps {
  /** Optional API to inject for tests; defaults to the real instance. */
  api?: SetupViewApi
  /** Optional timers to inject for tests; default to the real globals. */
  setTimeout?: typeof setTimeout
  clearTimeout?: typeof clearTimeout
}

export const Setup = ({
  api: injectedApi,
  setTimeout: setTimeoutImpl,
  clearTimeout: clearTimeoutImpl
}: SetupProps = {}): JSX.Element => {
  const apiImpl = injectedApi ?? defaultApi
  const [controller] = useState(() =>
    createSetupController({
      api: {
        getStatus: apiImpl.getSetupStatus,
        start: apiImpl.startSetupSession,
        getQr: apiImpl.getSetupQr
      },
      setTimeout: setTimeoutImpl ?? setTimeout,
      clearTimeout: clearTimeoutImpl ?? clearTimeout
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
      const result = await apiImpl.saveSetupConfig({
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
      await apiImpl.sendSetupTest({
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
