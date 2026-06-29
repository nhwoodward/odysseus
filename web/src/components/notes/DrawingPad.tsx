import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react"
import { Brush, Circle, Eraser, Trash2, Type, Undo2 } from "lucide-react"
import { IconButton } from "@/components/ui/IconButton"
import { cn } from "@/lib/utils"

type DrawTool = "pen" | "eraser" | "text" | "line" | "circle"
type DrawSize = "s" | "m" | "l"

const DRAW_SIZE_SEQUENCE: DrawSize[] = ["s", "m", "l"]
const DRAW_TEXT_SIZES: Record<DrawSize, number> = { s: 16, m: 26, l: 40 }
const DRAW_SHAPE_WIDTHS: Record<DrawSize, number> = { s: 2, m: 5, l: 10 }

interface TextDraft {
  id: number
  value: string
  x: number
  y: number
  left: number
  top: number
  fontCss: number
  fontCanvas: number
  maxWidth: number
  color: string
}

function clearCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = "source-over"
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.restore()
}

export function DrawingPad({ canvasRef, initialImageUrl }: { canvasRef: RefObject<HTMLCanvasElement | null>; initialImageUrl?: string }) {
  const [tool, setTool] = useState<DrawTool>("pen")
  const [stroke, setStroke] = useState("#222222")
  const [size, setSize] = useState(4)
  const [toolSize, setToolSize] = useState<DrawSize>("s")
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null)
  const shapeSnapshotRef = useRef<ImageData | null>(null)
  const undoRef = useRef<ImageData[]>([])
  const textDraftRef = useRef<TextDraft | null>(null)
  const textInputRef = useRef<HTMLInputElement>(null)
  const textDraftId = textDraft?.id

  useEffect(() => {
    textDraftRef.current = textDraft
  }, [textDraft])

  useEffect(() => {
    if (textDraftId == null) return
    requestAnimationFrame(() => {
      textInputRef.current?.focus()
      textInputRef.current?.select()
    })
  }, [textDraftId])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    clearCanvas(canvas)
    if (!initialImageUrl) return
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      } catch {
        clearCanvas(canvas)
      }
    }
    img.src = initialImageUrl
  }, [canvasRef, initialImageUrl])

  const snapshot = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    try {
      undoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
      if (undoRef.current.length > 30) undoRef.current.shift()
    } catch {
      /* canvas may be tainted by an older remote image */
    }
  }

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const cssPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      rect,
    }
  }

  const commitTextDraft = (draft = textDraftRef.current) => {
    if (!draft) return
    textDraftRef.current = null
    setTextDraft(null)
    const text = draft.value.trim()
    if (!text) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    snapshot()
    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.fillStyle = draft.color
    ctx.font = `${draft.fontCanvas}px sans-serif`
    ctx.textBaseline = "top"
    ctx.fillText(text, draft.x, draft.y - draft.fontCanvas * 0.7)
    ctx.restore()
  }

  const openTextInput = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    commitTextDraft()
    const canvas = event.currentTarget
    const p = point(event)
    const { x, y, rect } = cssPoint(event)
    const fontCss = DRAW_TEXT_SIZES[toolSize]
    const fontCanvas = fontCss * (canvas.width / rect.width)
    const top = Math.max(0, y - fontCss * 0.7)
    const left = Math.max(0, x)
    const maxWidth = Math.max(120, rect.width - left - 4)
    setTextDraft({
      id: Date.now(),
      value: "",
      x: p.x,
      y: p.y,
      left,
      top,
      fontCss,
      fontCanvas,
      maxWidth,
      color: stroke,
    })
  }

  const drawShape = (to: { x: number; y: number }) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const from = shapeStartRef.current
    if (!canvas || !ctx || !from) return
    if (shapeSnapshotRef.current) ctx.putImageData(shapeSnapshotRef.current, 0, 0)
    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.strokeStyle = stroke
    ctx.lineWidth = DRAW_SHAPE_WIDTHS[toolSize]
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.beginPath()
    if (tool === "line") {
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
    } else {
      ctx.arc(from.x, from.y, Math.hypot(to.x - from.x, to.y - from.y), 0, Math.PI * 2)
    }
    ctx.stroke()
    ctx.restore()
  }

  const begin = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    event.preventDefault()
    if (tool === "text") {
      event.stopPropagation()
      openTextInput(event)
      return
    }
    canvas.setPointerCapture(event.pointerId)
    const p = point(event)
    snapshot()
    drawingRef.current = true
    lastRef.current = p
    if (tool === "line" || tool === "circle") {
      shapeStartRef.current = p
      try {
        shapeSnapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch {
        shapeSnapshotRef.current = null
      }
      return
    }
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
  }

  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const canvas = event.currentTarget
    const ctx = canvas.getContext("2d")
    const last = lastRef.current
    if (!ctx || !last) return
    event.preventDefault()
    const p = point(event)
    if (tool === "line" || tool === "circle") {
      drawShape(p)
      return
    }
    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : stroke
    ctx.lineWidth = size * (tool === "eraser" ? 5 : 2)
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    ctx.restore()
    lastRef.current = p
  }

  const end = () => {
    drawingRef.current = false
    lastRef.current = null
    shapeStartRef.current = null
    shapeSnapshotRef.current = null
  }

  const undo = () => {
    if (textDraftRef.current) {
      setTextDraft(null)
      textDraftRef.current = null
      return
    }
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    const previous = undoRef.current.pop()
    if (!canvas || !ctx || !previous) return
    ctx.putImageData(previous, 0, 0)
  }

  const cycleSizedTool = (value: Extract<DrawTool, "text" | "line" | "circle">) => {
    if (tool !== value) {
      setTool(value)
      setToolSize("s")
      return
    }
    const index = DRAW_SIZE_SEQUENCE.indexOf(toolSize)
    const next = DRAW_SIZE_SEQUENCE[index + 1]
    if (next) setToolSize(next)
    else setTool("pen")
  }

  const toolButton = (value: DrawTool, title: string, icon: ReactNode) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => setTool(value)}
      className={cn("rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground", tool === value && "bg-secondary text-secondary-foreground")}
    >
      {icon}
    </button>
  )

  const sizedToolButton = (value: Extract<DrawTool, "text" | "line" | "circle">, title: string, icon: ReactNode) => {
    const active = tool === value
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => cycleSizedTool(value)}
        className={cn("relative rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground", active && "bg-secondary text-secondary-foreground")}
      >
        {icon}
        {active && (
          <span className="absolute -right-1 -top-1 rounded-full border bg-background px-1 text-[9px] font-semibold leading-3 text-foreground">
            {toolSize.toUpperCase()}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={900}
          height={480}
          className={cn("aspect-[15/8] w-full touch-none rounded-md border bg-white shadow-inner", tool === "text" ? "cursor-text" : "cursor-crosshair")}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          data-testid="note-drawing-canvas"
        />
        {textDraft && (
          <input
            ref={textInputRef}
            value={textDraft.value}
            onChange={(event) => setTextDraft((draft) => draft ? { ...draft, value: event.target.value } : draft)}
            onBlur={() => commitTextDraft()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                commitTextDraft()
              } else if (event.key === "Escape") {
                event.preventDefault()
                textDraftRef.current = null
                setTextDraft(null)
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="type then Enter"
            className="absolute z-10 min-w-28 rounded border-2 border-ring bg-white px-2 py-0.5 text-sm text-black shadow-lg outline-none"
            style={{
              left: textDraft.left,
              top: textDraft.top,
              fontSize: textDraft.fontCss,
              color: textDraft.color,
              maxWidth: textDraft.maxWidth,
            }}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-md border bg-background/95 px-2 py-1.5 sm:gap-2">
        {toolButton("pen", "Brush", <Brush className="size-4" />)}
        {toolButton("eraser", "Eraser", <Eraser className="size-4" />)}
        {sizedToolButton("text", "Add text - click to cycle size", <Type className="size-4" />)}
        {sizedToolButton("line", "Line - click to cycle size", <span className={cn("block h-4 w-4 rotate-45 border-t border-current", tool === "line" && toolSize === "m" && "border-t-2", tool === "line" && toolSize === "l" && "border-t-4")} />)}
        {sizedToolButton("circle", "Circle - click to cycle size", <Circle className={cn("size-4", tool === "circle" && toolSize === "l" && "stroke-[3]")} />)}
        <input type="color" value={stroke} onChange={(e) => setStroke(e.target.value)} title="Stroke color" className="h-7 w-8 rounded border bg-transparent p-0.5" />
        <input type="range" min={1} max={18} value={size} onChange={(e) => setSize(Number(e.target.value))} title="Stroke size" className="w-20 sm:w-32" />
        <span className="flex-1" />
        <IconButton type="button" icon={<Undo2 />} label="Undo" onClick={undo} className="text-muted-foreground" />
        <IconButton type="button" icon={<Trash2 />} label="Clear" onClick={() => { const canvas = canvasRef.current; if (canvas) { snapshot(); clearCanvas(canvas) } }} className="text-muted-foreground hover:text-destructive" />
      </div>
    </div>
  )
}
