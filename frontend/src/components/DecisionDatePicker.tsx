import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useId, useRef, useState } from "react";

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function DecisionDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = value ? new Date(`${value}T12:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const today = isoDate(new Date());
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const choose = (date: string) => {
    onChange(date);
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <div className="decision-date" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    }}>
      <label id={`${id}-label`} htmlFor={id} className="flex items-baseline justify-between text-sm font-medium">
        Decide by <span className="text-xs font-normal text-muted">Optional</span>
      </label>
      <button ref={trigger} id={id} type="button" className="input-base decision-date-trigger"
        aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-calendar` : undefined}
        onClick={() => setOpen(!open)}>
        <span id={`${id}-value`} className={value ? "" : "text-muted"}>
          {value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Choose a date"}
        </span>
        <CalendarDays size={17} className="text-muted" aria-hidden="true" />
      </button>
      {open && <section id={`${id}-calendar`} aria-label="Choose a deadline" className="decision-calendar">
        <div className="decision-calendar-heading">
          <button type="button" aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
          <span aria-live="polite">{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
          <button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        </div>
        <div className="decision-calendar-grid">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(day => <span key={day} className="decision-calendar-weekday">{day}</span>)}
          {Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
            const iso = isoDate(date);
            return <button key={iso} type="button" aria-label={date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
              aria-pressed={value === iso} aria-current={today === iso ? "date" : undefined}
              className={`${date.getMonth() !== month.getMonth() ? "outside-month" : ""} ${value === iso ? "selected-date" : ""}`}
              onClick={() => choose(iso)}>{date.getDate()}</button>;
          })}
        </div>
        <div className="decision-calendar-footer">
          <button type="button" onClick={() => choose("")}><X size={13} aria-hidden="true" /> Clear</button>
          <button type="button" onClick={() => choose(today)}>Today</button>
        </div>
      </section>}
    </div>
  );
}
