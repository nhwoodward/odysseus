import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlashMenu } from './SlashMenu'
import type { ComposerController } from './useComposerController'

// Minimal fake controller exposing only the fields SlashMenu reads. The cmdk
// list is purely presentational here — filtering is done by the controller
// (shouldFilter=false) and keyboard nav lives in ComposerInput, so this guards
// rendering + that a mouse pick still routes through pickSlash.
function fakeCtl(over: Partial<ComposerController>): ComposerController {
  return {
    slashOpen: true,
    sel: 0,
    slashMatches: [
      { kind: 'core', token: '/memory', name: 'memory', help: 'save a memory' },
      { kind: 'skill', token: '/research', name: 'research', help: 'deep research' },
    ],
    pickSlash: vi.fn(),
    setSlashSel: vi.fn(),
    ...over,
  } as unknown as ComposerController
}

describe('SlashMenu (cmdk)', () => {
  afterEach(cleanup)

  it('renders nothing when closed', () => {
    const { container } = render(<SlashMenu ctl={fakeCtl({ slashOpen: false })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the filtered slash commands as cmdk items', () => {
    render(<SlashMenu ctl={fakeCtl({})} />)
    expect(screen.getByText('/memory')).toBeInTheDocument()
    expect(screen.getByText('/research')).toBeInTheDocument()
    expect(screen.getByText('save a memory')).toBeInTheDocument()
  })

  it('picks a command on mouse-down (preserving textarea focus)', () => {
    const pickSlash = vi.fn()
    render(<SlashMenu ctl={fakeCtl({ pickSlash })} />)
    fireEvent.mouseDown(screen.getByText('/research'))
    expect(pickSlash).toHaveBeenCalledWith('research')
    expect(pickSlash).toHaveBeenCalledTimes(1)
  })
})
