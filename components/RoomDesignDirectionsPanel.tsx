"use client";

import { ClipboardList, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  buildRoomDesignDirectionReport,
  type RoomDesignDirectionReport
} from "@/lib/room-design-directions";
import type { StoredFloorPlan } from "@/lib/types";

type RoomDesignDirectionsPanelProps = {
  floorPlans: StoredFloorPlan[];
  styleLabel: string;
  disabled?: boolean;
  onApplyDirections: (directionText: string) => void;
};

function getCategoryLabel(category: RoomDesignDirectionReport["directions"][number]["category"]) {
  return category === "bath" ? "bathroom" : category;
}

export default function RoomDesignDirectionsPanel({
  floorPlans,
  styleLabel,
  disabled = false,
  onApplyDirections
}: RoomDesignDirectionsPanelProps) {
  const report = useMemo(
    () => buildRoomDesignDirectionReport({ floorPlans, styleLabel }),
    [floorPlans, styleLabel]
  );
  const [draftText, setDraftText] = useState(report.directionText);

  useEffect(() => {
    setDraftText((current) => (current === report.directionText ? current : report.directionText));
  }, [report.directionText]);

  const hasDirections = draftText.trim().length > 0;

  return (
    <section className="panel room-directions-panel">
      <div className="panel-header">
        <div>
          <div className="section-title">Room design directions</div>
          <div className="muted">
            Convert detected rooms into prompt-ready design notes before rendering.
          </div>
        </div>
        <span className="badge room-directions-badge">
          <ClipboardList size={14} />
          {report.roomCount} room{report.roomCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="room-directions-summary">
        <div className="room-directions-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <div className="room-directions-copy">{report.summary}</div>
          <div className="muted">
            These notes are editable here, then merged into the design direction section of the render brief.
          </div>
        </div>
      </div>

      {report.directions.length > 0 ? (
        <>
          <div className="room-directions-chip-row">
            {report.directions.slice(0, 8).map((room) => (
              <span key={room.id} className={`room-directions-chip is-${room.category}`}>
                {room.label} · {getCategoryLabel(room.category)}
              </span>
            ))}
            {report.directions.length > 8 ? (
              <span className="room-directions-chip">
                +{report.directions.length - 8} more
              </span>
            ) : null}
          </div>

          <label className="field">
            <span className="field-label">Editable room prompt notes</span>
            <textarea
              className="field-textarea room-directions-textarea"
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              disabled={disabled}
            />
          </label>

          <div className="room-directions-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => onApplyDirections(draftText)}
              disabled={disabled || !hasDirections}
            >
              <ClipboardList size={16} />
              Add to design brief
            </button>
          </div>
        </>
      ) : (
        <div className="prompt-preview-empty">
          Draw or detect rooms in the floor plan editor before adding room-specific design direction.
        </div>
      )}
    </section>
  );
}
