import { signal } from '@preact/signals'
import type { JSX } from 'preact'
import { useEffect } from 'preact/hooks'
import { Admin } from './views/Admin'
import { Setup } from './views/Setup'

// D5: hash routing — '#/setup' and '#/admin' never collide with the
// backend's /admin/*, /photos/* or /setup/* HTTP routes.
const readRoute = (): 'setup' | 'admin' =>
  window.location.hash === '#/admin' ? 'admin' : 'setup'

export const route = signal<'setup' | 'admin'>(readRoute())

const syncRoute = (): void => {
  route.value = readRoute()
}

export const App = (): JSX.Element => {
  useEffect(() => {
    window.addEventListener('hashchange', syncRoute)

    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  return (
    <div class="app">
      <nav class="nav">
        <a href="#/setup" class={route.value === 'setup' ? 'active' : ''}>
          Setup
        </a>
        <a href="#/admin" class={route.value === 'admin' ? 'active' : ''}>
          Photo admin
        </a>
      </nav>
      {route.value === 'admin' ? <Admin /> : <Setup />}
    </div>
  )
}
