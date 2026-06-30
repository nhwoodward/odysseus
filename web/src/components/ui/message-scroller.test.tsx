import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from './message-scroller'

// jsdom can't validate scroll FEEL (ResizeObserver/IntersectionObserver are
// no-op mocks; scrollHeight/clientHeight are 0). This guards the thing that IS
// testable: the @shadcn/react controller mounts under jsdom with our setup.ts
// polyfills, the provider/viewport/content/item/button nesting renders, and
// rows show through — i.e. the dep won't throw on every ChatConsole render.
describe('MessageScroller', () => {
  afterEach(cleanup)

  it('mounts the scroller composition and renders item rows without throwing', () => {
    render(
      <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller>
          <MessageScrollerViewport>
            <MessageScrollerContent>
              <MessageScrollerItem messageId="0" scrollAnchor>
                <div>first turn</div>
              </MessageScrollerItem>
              <MessageScrollerItem messageId="1">
                <div>second turn</div>
              </MessageScrollerItem>
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton direction="end" />
        </MessageScroller>
      </MessageScrollerProvider>
    )
    expect(screen.getByText('first turn')).toBeInTheDocument()
    expect(screen.getByText('second turn')).toBeInTheDocument()
    // The scroll button carries its sr-only label even when inert.
    expect(screen.getByText('Scroll to latest')).toBeInTheDocument()
  })
})
