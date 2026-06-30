import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComposerToolbar } from './ComposerToolbar'
import type { ComposerController } from './useComposerController'

// Stub the heavy controls (ToolsMenu/ModelPicker pull react-query + router);
// we only care about the toolbar's layout + the "+" tray disclosure here.
vi.mock('../ComposerControls', () => ({
  ModePicker: () => <div data-testid="mode-picker" />,
  ModelPicker: () => <div data-testid="model-picker" />,
  ToolsMenu: () => <button data-testid="tools-menu-inner">Tools</button>,
  SourcesMenu: () => <button data-testid="sources-menu-inner">Sources</button>,
}))

function fakeCtl(over: Partial<ComposerController> = {}): ComposerController {
  return {
    fileRef: { current: null },
    onFiles: vi.fn(),
    caps: undefined,
    toggleMic: vi.fn(),
    transcribing: false,
    recording: false,
    streaming: false,
    onStop: vi.fn(),
    submit: vi.fn(),
    text: '',
    atts: [],
    uploading: false,
    ...over,
  } as unknown as ComposerController
}

describe('ComposerToolbar', () => {
  afterEach(cleanup)

  it('keeps the minimal row and tucks secondary controls behind "+"', () => {
    render(<ComposerToolbar ctl={fakeCtl()} />)
    // Minimal row always shows model, mode, and the + entry point.
    expect(screen.getByTestId('model-picker')).toBeInTheDocument()
    expect(screen.getByTestId('mode-picker')).toBeInTheDocument()
    expect(screen.getByLabelText('More options')).toBeInTheDocument()
    // Tray contents are hidden until the + is opened.
    expect(screen.queryByTestId('tools-menu-inner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sources-menu-inner')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Attach files')).not.toBeInTheDocument()
  })

  it('reveals attach + Tools + Sources when the "+" is clicked', () => {
    render(<ComposerToolbar ctl={fakeCtl()} />)
    const more = screen.getByLabelText('More options')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Attach files')).toBeInTheDocument()
    expect(screen.getByTestId('tools-menu-inner')).toBeInTheDocument()
    expect(screen.getByTestId('sources-menu-inner')).toBeInTheDocument()
  })

  it('closes the tray on Escape', () => {
    render(<ComposerToolbar ctl={fakeCtl()} />)
    fireEvent.click(screen.getByLabelText('More options'))
    expect(screen.getByTestId('tools-menu-inner')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByTestId('tools-menu-inner')).not.toBeInTheDocument()
  })

  it('opens the file dialog from the tray and closes the tray', () => {
    // React assigns the real <input> DOM node to fileRef.current on mount, so
    // spy on the element's click rather than a mock ref.
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    render(<ComposerToolbar ctl={fakeCtl()} />)
    fireEvent.click(screen.getByLabelText('More options'))
    fireEvent.click(screen.getByLabelText('Attach files'))
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('tools-menu-inner')).not.toBeInTheDocument()
    click.mockRestore()
  })

  it('renders a round send button, disabled until there is text, and submits', () => {
    const submit = vi.fn()
    const { rerender } = render(<ComposerToolbar ctl={fakeCtl({ submit })} />)
    const send = screen.getByTitle('Send')
    expect(send).toHaveClass('rounded-full')
    expect(send).toBeDisabled()
    rerender(<ComposerToolbar ctl={fakeCtl({ submit, text: 'hello' })} />)
    const sendReady = screen.getByTitle('Send')
    expect(sendReady).not.toBeDisabled()
    fireEvent.click(sendReady)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('shows a round Stop button while streaming', () => {
    const onStop = vi.fn()
    render(<ComposerToolbar ctl={fakeCtl({ streaming: true, onStop })} />)
    const stop = screen.getByTitle('Stop')
    expect(stop).toHaveClass('rounded-full')
    fireEvent.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('shows the mic on the row when speech-to-text is available', () => {
    render(<ComposerToolbar ctl={fakeCtl({ caps: { stt: true } as ComposerController['caps'] })} />)
    expect(screen.getByLabelText('Dictate')).toBeInTheDocument()
  })
})
