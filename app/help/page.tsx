import Link from "next/link"

import { SHORTCUT_GROUPS } from "@/lib/shortcuts"

const TOOLS_GUIDE = [
  {
    name: "Select",
    shortcut: "Esc",
    description:
      "Select is the default mode for inspecting, moving, and editing existing geometry. Press Esc at any time to leave the current drawing tool and get back to normal selection behavior.",
  },
  {
    name: "Wall",
    shortcut: "W",
    description:
      "Wall mode is the fastest way to draft a plan from scratch or trace over an uploaded image. Click once to start, click again to finish each segment, and keep chaining walls until you press Esc.",
  },
  {
    name: "Room",
    shortcut: "R",
    description:
      "Rooms are often created automatically from closed wall loops, but the Room tool lets you draw a polygon manually when you need cleanup or custom spaces. Click points around the perimeter and close the shape to finish it.",
  },
  {
    name: "Door",
    shortcut: "D",
    description:
      "Door placement snaps to the nearest wall so openings stay attached to the plan geometry. After placement, use the properties panel to refine type, width, and other details.",
  },
  {
    name: "Window",
    shortcut: "N",
    description:
      "Window mode also snaps directly onto an existing wall segment. Once placed, you can fine-tune size and positioning from the properties panel without redrawing the wall.",
  },
  {
    name: "Furniture",
    shortcut: "T",
    description:
      "Use Furniture to place layout references like seating or casework on the plan. These items help communicate scale and intent without changing the structural drafting underneath.",
  },
  {
    name: "Measure",
    shortcut: "M",
    description:
      "Measure creates quick point-to-point dimensions on the canvas. Click once to start, click again to finish, and use it to verify spans while you draft or trace.",
  },
  {
    name: "Annotate",
    shortcut: "A",
    description:
      "Annotate adds callouts and notes directly into the drawing. It is useful for construction notes, client comments, or marking problem areas before export.",
  },
  {
    name: "Calibrate",
    shortcut: "C",
    description:
      "Calibrate sets the drawing scale from a known real-world distance. After calibration, measurements, wall lengths, and room areas become much more reliable across the entire floor.",
  },
]

const FAQS = [
  {
    question: "Why are rooms not appearing automatically?",
    answer:
      "Automatic rooms depend on fully closed wall loops. Check for tiny gaps, overlapping endpoints, or walls that miss each other by a small distance, then close the loop or draw the room manually with the Room tool.",
  },
  {
    question: "Can I replace the source image after I start drafting?",
    answer:
      "Yes. Use the Upload or Replace image button in the editor toolbar to swap the source plan, then use the overlay toggle and opacity slider to continue tracing against the new image.",
  },
  {
    question: "Where do I export a PDF client package?",
    answer:
      "PDF export is available from the project overview page, not inside the editor toolbar. The editor handles PNG and DXF, while the overview page assembles the broader client package.",
  },
  {
    question: "How do I save alternate layouts without losing the current one?",
    answer:
      "Open the Versions panel in the editor, give the current state a name, and save it as a version. You can preview named versions later and restore one when you want to roll back.",
  },
  {
    question: "Can I work across multiple floors in one project?",
    answer:
      "Yes. Projects can contain multiple saved floors, and you can add new ones from either the overview page or the editor. Use the floor pills to switch the active floor before editing or exporting.",
  },
  {
    question: "What does DXF include?",
    answer:
      "DXF is intended for CAD handoff and exports the drafted floor plan geometry. It is different from the PDF package and does not depend on the temporary source-image overlay used while tracing.",
  },
]

export default function HelpPage() {
  return (
    <main className="page-shell help-page">
      <div className="page-heading">
        <div>
          <div className="page-title">Help Center</div>
          <div className="muted">
            Workflow guides, shortcuts, and reference material for Floor Plan Studio.
          </div>
        </div>
        <div className="button-row" style={{ alignItems: "center" }}>
          <Link href="/projects/new" className="button-secondary">
            Create project
          </Link>
          <Link href="/" className="button-ghost">
            Back to dashboard
          </Link>
        </div>
      </div>

      <div className="help-stack">
        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Getting Started</div>
              <div className="muted">
                The typical workflow is create project, draw or upload, edit, render, then export.
              </div>
            </div>
          </div>
          <ol className="help-list">
            <li>Create a new project and add the client, address, and floor name basics.</li>
            <li>Start from a template or upload a floor plan image to seed the project.</li>
            <li>Open the editor to trace walls, clean up rooms, place openings, and annotate the plan.</li>
            <li>Generate renders from the Renders tab when you want presentation imagery.</li>
            <li>Export PNG or DXF from the editor, or export a PDF client package from the overview page.</li>
          </ol>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Keyboard Shortcuts</div>
              <div className="muted">These match the editor shortcut panel so the reference stays in sync.</div>
            </div>
          </div>
          <div className="help-shortcut-grid">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="help-shortcut-card">
                <div className="help-card-title">{group.title}</div>
                <div className="shortcuts-list">
                  {group.shortcuts.map((shortcut) => (
                    <div key={`${group.title}-${shortcut.label}`} className="shortcut-row">
                      <div className="shortcut-keys">
                        {shortcut.keys.map((key, index) => (
                          <span key={`${shortcut.label}-${key}`}>
                            {index > 0 ? <span className="shortcut-plus">+</span> : null}
                            <kbd className="shortcut-key">{key}</kbd>
                          </span>
                        ))}
                      </div>
                      <span className="shortcut-label">{shortcut.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Tools Guide</div>
              <div className="muted">Each tool is optimized for a specific drafting task.</div>
            </div>
          </div>
          <div className="help-tool-grid">
            {TOOLS_GUIDE.map((tool) => (
              <article key={tool.name} className="help-tool-card">
                <div className="help-tool-header">
                  <div className="help-card-title">{tool.name}</div>
                  <kbd className="shortcut-key">{tool.shortcut}</kbd>
                </div>
                <p className="muted">{tool.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Working with Source Images</div>
              <div className="muted">Use source plans as a tracing underlay without changing the drawing itself.</div>
            </div>
          </div>
          <div className="help-grid">
            <div className="help-note">
              Upload a source image when you create the project, or use the editor toolbar to add or replace it later.
              Once an image is attached, the overlay controls let you show or hide it while keeping your drafted geometry separate.
            </div>
            <div className="help-note">
              Adjust overlay opacity to make traced walls easier to see, and re-upload the image any time if a cleaner scan
              or revised plan becomes available.
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Scale Calibration</div>
              <div className="muted">Use calibration whenever you are tracing an imported plan with a known dimension.</div>
            </div>
          </div>
          <ol className="help-list">
            <li>Press <kbd className="shortcut-key">C</kbd> or choose the Calibrate tool.</li>
            <li>Click the first known point on the plan.</li>
            <li>Click the second known point that matches a real measured distance.</li>
            <li>Enter the actual distance in feet in the calibration dialog.</li>
            <li>Apply the calibration so dimensions, room areas, and wall lengths update to the new scale.</li>
          </ol>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">Exporting</div>
              <div className="muted">Choose the export format based on who needs the file next.</div>
            </div>
          </div>
          <div className="help-grid">
            <article className="help-note">
              <strong>PNG</strong>
              <p className="muted">Export from the editor for quick image sharing, markup, or internal review snapshots.</p>
            </article>
            <article className="help-note">
              <strong>DXF</strong>
              <p className="muted">Export from the editor when the floor plan needs to move into AutoCAD or another CAD workflow.</p>
            </article>
            <article className="help-note">
              <strong>PDF</strong>
              <p className="muted">Export from the overview page when you need a client-facing package that bundles project information and outputs together.</p>
            </article>
          </div>
        </section>

        <div className="help-grid help-grid-halves">
          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-title">Templates</div>
                <div className="muted">Templates speed up new projects when you do not want to start from a blank floor.</div>
              </div>
            </div>
            <p className="muted">
              On project creation, choose a starter template before you submit the form. If you also upload a floor plan
              image, the uploaded source takes priority for the initial plan setup.
            </p>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <div className="section-title">Versioning</div>
                <div className="muted">Named versions let you explore options without losing a preferred layout.</div>
              </div>
            </div>
            <ol className="help-list">
              <li>Open the Versions panel in the editor.</li>
              <li>Enter a descriptive version name such as &quot;Kitchen option A&quot;.</li>
              <li>Save the current state, preview stored versions, and restore one when needed.</li>
            </ol>
          </section>
        </div>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="section-title">FAQ</div>
              <div className="muted">Common issues and where to look first.</div>
            </div>
          </div>
          <div className="help-faq-list">
            {FAQS.map((faq) => (
              <article key={faq.question} className="help-faq-item">
                <div className="help-card-title">{faq.question}</div>
                <p className="muted">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
