/**
 * Cell.tsx
 * --------
 * Core notebook component responsible for rendering individual cells (Code or Markdown).
 * Supports executing C++ code, editing with Monaco, rendering outputs, handling standard input,
 * and standard notebook operations (move, delete, toggle type).
 */

import React, { useRef, useEffect, useState, useMemo } from "react";
import { NotebookCell, OutputItem, CellStatus } from "../types";
import { Play, Square, Trash, ArrowUp, ArrowDown, Code, Type, Copy, X, Eraser } from "lucide-react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus, vs } from "react-syntax-highlighter/dist/esm/styles/prism";

// Strip ANSI escape codes produced by xeus-cling tracebacks
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[\d;]*[A-Za-z]/g;
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, "");
}

interface CellProps {
  cell: NotebookCell;
  index: number;
  codeIndex: number;
  executionOrder?: number | null;
  status: CellStatus;
  outputs: OutputItem[];
  prompt?: { prompt: string; value: string };
  theme: "light" | "dark";
  onUpdate: (source: string) => void;
  onRun: () => void;
  onStop: () => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onChangeType: (type: "markdown" | "code") => void;
  onSubmitInput: (value: string) => void;
  onPromptChange: (value: string) => void;
  onAddCell: (index: number, type: "markdown" | "code") => void;
  onClearOutputs: () => void;
  onClearCell: () => void;
}

/**
 * Returns a human-readable execution status label for the top-left of the cell.
 */
function execLabel(status: CellStatus, order?: number | null) {
  if (status === "running") return "[*]";
  if (status === "queued") return "[…]";
  if (order != null) return `[${order}]`;
  return "[ ]";
}

export function Cell({
  cell, index, codeIndex, executionOrder, status, outputs, prompt, theme,
  onUpdate, onRun, onStop, onDelete, onMove, onChangeType,
  onSubmitInput, onPromptChange, onAddCell, onClearOutputs, onClearCell,
}: CellProps) {
  const [isEditing, setIsEditing] = useState(cell.cell_type === "code" || !cell.source);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-switch to edit mode if type changes to code
  useEffect(() => { if (cell.cell_type === "code") setIsEditing(true); }, [cell.cell_type]);

  // Auto-focus the stdin input whenever a prompt appears
  useEffect(() => {
    if (prompt) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [prompt]);

  // Handle clicking outside a markdown cell to render it
  const handleBlur = (e: React.FocusEvent) => {
    if (cell.cell_type === "markdown" && !containerRef.current?.contains(e.relatedTarget as Node)) {
      if (cell.source.trim()) setIsEditing(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(cell.source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Stop execution and clear outputs so the output panel collapses
  const handleStop = () => {
    onStop();
    onClearOutputs();
  };

  const isRunning = status === "running" || status === "queued" || status === "waiting-input";
  const hasOutput = outputs.length > 0 || !!prompt;
  const shouldShowOutputPanel = hasOutput || isRunning;

  // Merge consecutive same-stream outputs (e.g. rapid stdout prints) so we don't create hundreds of tiny <pre> blocks
  const mergedOutputs = useMemo(() => {
    type MergedItem = OutputItem & { _key: number };
    const merged: MergedItem[] = [];
    for (let i = 0; i < outputs.length; i++) {
      const o = outputs[i];
      const prev = merged[merged.length - 1];
      if (
        o.kind === "stream" &&
        prev?.kind === "stream" &&
        prev.stream === o.stream
      ) {
        // Merge text into previous block
        merged[merged.length - 1] = { ...prev, text: (prev.text || "") + (o.text || "") };
      } else {
        merged.push({ ...o, _key: i });
      }
    }
    return merged;
  }, [outputs]);

  /**
   * Translates output payload data into appropriate React elements.
   * Handles stream text, error tracebacks, images (base64), HTML, and plain text.
   */
  const renderOutput = (output: OutputItem & { _key: number }) => {
    if (output.kind === "stream") {
      return (
        <pre
          className={`output-block ${output.stream === "stderr" ? "output-error" : "output-stdout"}`}
          key={output._key}
        >
          {output.text}
        </pre>
      );
    }
    if (output.kind === "error") {
      const header = [output.ename, output.evalue].filter(Boolean).join(": ");
      const traceLines = (output.traceback ?? []).map(stripAnsi);
      const text = [header, ...traceLines].filter(Boolean).join("\n");
      return (
        <pre className="output-block output-error" key={output._key}>
          {text}
        </pre>
      );
    }
    const d = output.data ?? {};
    if (d["image/png"])
      return <img className="output-image" key={output._key} src={`data:image/png;base64,${d["image/png"]}`} alt="output" />;
    if (d["image/jpeg"])
      return <img className="output-image" key={output._key} src={`data:image/jpeg;base64,${d["image/jpeg"]}`} alt="output" />;
    if (d["text/html"])
      return <div className="output-block" key={output._key} dangerouslySetInnerHTML={{ __html: d["text/html"] }} />;
    if (d["text/plain"])
      return <pre className="output-block output-plain" key={output._key}>{stripAnsi(d["text/plain"])}</pre>;
    return null;
  };

  // Dynamic height calculation based on lines of code
  const editorHeight = Math.max(80, Math.min(600, cell.source.split("\n").length * 20 + 24));

  return (
    <div className="cell-wrapper" ref={containerRef} onBlur={handleBlur} tabIndex={-1}>
      {/* Insert cell above divider */}
      <div className="add-cell-divider">
        <div className="add-cell-buttons">
          <button onClick={() => onAddCell(index, "code")}><Code size={10} /> Code</button>
          <button onClick={() => onAddCell(index, "markdown")}><Type size={10} /> Markdown</button>
        </div>
      </div>

      <div className={`cell-card cell-type-${cell.cell_type}`}>
        {/* Toolbar */}
        <div className="cell-toolbar">
          <div className="cell-toolbar-left">
            {cell.cell_type === "code" ? (
              <>
                <span className="execution-count">{execLabel(status, executionOrder)}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", opacity: 0.7, letterSpacing: "0.05em" }}>C++</span>
                {isRunning && (
                  <span className={`status-pill status-${status}`}>
                    {status === "waiting-input" ? "stdin" : status}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 600, color: "var(--success)", opacity: 0.7 }}>MARKDOWN</span>
            )}
          </div>

          <div className="cell-toolbar-right">
            {/* Toggle cell type */}
            <button className="icon-button" onClick={() => onChangeType(cell.cell_type === "code" ? "markdown" : "code")} title="Toggle type">
              {cell.cell_type === "code" ? <Type size={13} /> : <Code size={13} />}
            </button>

            {/* Copy source */}
            <button className="icon-button" onClick={handleCopy} title="Copy source">
              {copied
                ? <span style={{ fontSize: 10, color: "var(--success)" }}>✓</span>
                : <Copy size={13} />}
            </button>

            {/* Clear outputs */}
            {cell.cell_type === "code" && (
              <button
                className="icon-button"
                onClick={onClearOutputs}
                title="Clear output"
                disabled={!hasOutput}
                style={{ opacity: hasOutput ? 1 : 0.35 }}
              >
                <Eraser size={13} />
              </button>
            )}

            {/* Run / Stop */}
            {cell.cell_type === "code" && (
              isRunning ? (
                <button className="icon-button" onClick={handleStop} title="Stop execution" style={{ color: "var(--error)" }}>
                  <Square size={13} fill="currentColor" />
                </button>
              ) : (
                <button className="icon-button" onClick={onRun} title="Run cell (Shift+Enter)" style={{ color: "var(--success)" }}>
                  <Play size={13} fill="currentColor" />
                </button>
              )
            )}

            <button className="icon-button" onClick={() => onMove(-1)} title="Move up"><ArrowUp size={13} /></button>
            <button className="icon-button" onClick={() => onMove(1)} title="Move down"><ArrowDown size={13} /></button>
            <button className="icon-button" onClick={onDelete} title="Delete cell" style={{ color: "var(--error)" }}><Trash size={13} /></button>
          </div>
        </div>

        {/* Editor / Preview */}
        <div className="cell-editor">
          {cell.cell_type === "markdown" && !isEditing ? (
            <div className="markdown-preview" onClick={() => setIsEditing(true)}>
              <ReactMarkdown
                components={{
                  code({node, inline, className, children, ...props}: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        {...props}
                        children={String(children).replace(/\n$/, "")}
                        style={theme === "dark" ? vscDarkPlus as any : vs as any}
                        language={match[1]}
                        PreTag="div"
                      />
                    ) : (
                      <code {...props} className={className}>
                        {children}
                      </code>
                    );
                  }
                }}
              >{cell.source || "*Empty — click to edit*"}</ReactMarkdown>
            </div>
          ) : cell.cell_type === "markdown" ? (
            <textarea
              autoFocus
              value={cell.source}
              onChange={e => onUpdate(e.target.value)}
              className="markdown-textarea"
              placeholder="Enter markdown here…"
            />
          ) : (
            <div style={{ height: editorHeight }}>
              <Editor
                height="100%"
                language="cpp"
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={cell.source}
                onChange={val => onUpdate(val ?? "")}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  lineNumbersMinChars: 3,
                  folding: false,
                  renderLineHighlight: "all",
                  scrollbar: { alwaysConsumeMouseWheel: false },
                  padding: { top: 8, bottom: 8 },
                }}
              />
            </div>
          )}
        </div>

        {/* Output panel — visible while running (even before first output) or when outputs/prompt exist */}
        {shouldShowOutputPanel && (
          <div className="output-panel">
            <div className="output-panel-header">
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Output</span>
              <button
                className="icon-button"
                style={{ padding: "2px 4px" }}
                onClick={onClearOutputs}
                title="Clear output"
                disabled={!hasOutput}
              >
                <X size={11} />
              </button>
            </div>

            {/* Rendered outputs */}
            {mergedOutputs.map(renderOutput)}

            {/* Running placeholder (no output yet) */}
            {outputs.length === 0 && !prompt && isRunning && (
              <pre className="output-block output-plain output-running-placeholder">
                {status === "queued"
                  ? "⏳ Queued…"
                  : status === "waiting-input"
                  ? "⌨️  Waiting for input…"
                  : "⚙️  Running…"}
              </pre>
            )}

            {/* Stdin input row */}
            {prompt && (
              <div className="input-prompt-row">
                <span className="input-prompt-label">{prompt.prompt || "stdin›"}</span>
                <input
                  ref={inputRef}
                  autoFocus
                  className="input-prompt-field"
                  value={prompt.value}
                  onChange={e => onPromptChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onSubmitInput(prompt.value);
                    }
                  }}
                  placeholder="Type input and press Enter…"
                />
                <button className="primary" onClick={() => onSubmitInput(prompt.value)}>Send ↵</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
