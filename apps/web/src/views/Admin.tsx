import type { JSX } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { createAdminController } from '../controller/admin-controller'
import { api } from '../instance'

// WF-7..9: persons CRUD (owner protected), per-person photo management and
// the unidentified tray (list / delete / promote). All mutations go through
// the signals controller so the state stays testable without DOM.
const controller = createAdminController({ api })

const Admin = (): JSX.Element => {
  const state = controller.state.value
  const [newName, setNewName] = useState('')
  const [promoteTarget, setPromoteTarget] = useState<string>('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    controller.load()
  }, [])

  const create = (): void => {
    const name = newName.trim()

    if (!name) return
    controller.createPerson(name)
    setNewName('')
  }

  const rename = (name: string): void => {
    const next = globalThis.prompt(`Rename "${name}" to`, name)

    if (next && next.trim() && next.trim() !== name)
      controller.renamePerson(name, next.trim())
  }

  const remove = (name: string): void => {
    if (globalThis.confirm(`Delete "${name}" and all its photos?`))
      controller.deletePerson(name)
  }

  const upload = (): void => {
    const input = fileInput.current
    const files = Array.from(input?.files ?? [])

    if (!state.selectedPerson || files.length === 0) return

    controller.uploadPhotos(
      state.selectedPerson,
      files.map(file => ({ file, name: file.name }))
    )
    if (input) input.value = ''
  }

  const isOwner = (name: string): boolean => name === state.owner

  return (
    <main class="admin">
      <div class="admin-header">
        <h2>Photo admin</h2>
        <button type="button" onClick={() => controller.load()}>
          Refresh
        </button>
      </div>

      {state.error && (
        <p class="error" role="alert">
          {state.error}
          <button
            type="button"
            class="error-dismiss"
            onClick={controller.clearError}
          >
            Dismiss
          </button>
        </p>
      )}

      {state.loading && state.persons.length === 0 ? (
        <p>Loading&hellip;</p>
      ) : (
        <div class="admin-grid">
          <section class="persons">
            <h3>Known persons</h3>
            <ul class="person-list">
              {state.persons.map(person => (
                <li
                  key={person.name}
                  class={state.selectedPerson === person.name ? 'active' : ''}
                >
                  <button
                    type="button"
                    class="person-select"
                    onClick={() => controller.selectPerson(person.name)}
                  >
                    {person.name}{' '}
                    <span class="count">{person.photoCount} photos</span>
                  </button>
                  {!isOwner(person.name) && (
                    <span class="person-actions">
                      <button type="button" onClick={() => rename(person.name)}>
                        Rename
                      </button>
                      <button
                        type="button"
                        class="danger"
                        onClick={() => remove(person.name)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <div class="create-person">
              <input
                value={newName}
                placeholder="New person name"
                onInput={event =>
                  setNewName((event.target as HTMLInputElement).value)
                }
              />
              <button type="button" onClick={create} disabled={!newName.trim()}>
                Add
              </button>
            </div>
          </section>

          <section class="photos">
            <h3>
              {state.selectedPerson
                ? `${state.selectedPerson} photos`
                : 'Photos'}
            </h3>
            {state.selectedPerson ? (
              <>
                <div class="upload-row">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="image/*"
                  />
                  <button type="button" onClick={upload}>
                    Upload
                  </button>
                </div>
                <ul class="photo-grid">
                  {state.photos.map(item => (
                    <li key={item.filename} class="photo-item">
                      <img src={item.url} alt={item.filename} loading="lazy" />
                      <span class="photo-name">{item.filename}</span>
                      <button
                        type="button"
                        class="danger"
                        onClick={() =>
                          controller.deletePhoto(
                            state.selectedPerson!,
                            item.filename
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {state.photos.length === 0 && <p>No photos yet.</p>}
              </>
            ) : (
              <p>Select a person to manage their photos.</p>
            )}
          </section>

          <section class="tray">
            <h3>Unidentified tray</h3>
            {state.tray.length === 0 ? (
              <p>Nothing waiting.</p>
            ) : (
              <ul class="tray-list">
                {state.tray.map(item => (
                  <li key={item.filename} class="tray-item">
                    <img src={item.url} alt={item.filename} loading="lazy" />
                    <span class="photo-name">{item.filename}</span>
                    <select
                      value={promoteTarget}
                      onChange={event =>
                        setPromoteTarget(
                          (event.target as HTMLSelectElement).value
                        )
                      }
                    >
                      <option value="">Promote to&hellip;</option>
                      {state.persons.map(person => (
                        <option key={person.name} value={person.name}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!promoteTarget}
                      onClick={() =>
                        controller.promotePhoto(item.filename, promoteTarget)
                      }
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      class="danger"
                      onClick={() =>
                        controller.deleteUnidentified(item.filename)
                      }
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  )
}

export { Admin }
