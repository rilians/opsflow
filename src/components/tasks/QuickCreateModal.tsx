import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Sparkles, Wand2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import {
  CATEGORIES,
  PRIORITIES,
  SOURCES,
  CATEGORY_DEPARTMENT,
} from "@/lib/catalog";
import { useStore } from "@/services/store";
import type { Priority, RequestSource, TaskCategory } from "@/types";
import { fmtHours } from "@/lib/utils";

interface FormState {
  title: string;
  description: string;
  category: TaskCategory;
  priority: Priority;
  source: RequestSource;
  requesterName: string;
  requesterEmail: string;
  slaHours: number | "";
}

const empty = (defaults: Partial<FormState> = {}): FormState => ({
  title: "",
  description: "",
  category: "IT Support",
  priority: "Medium",
  source: "Portal",
  requesterName: "",
  requesterEmail: "",
  slaHours: "",
  ...defaults,
});

export function QuickCreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state, createTask, runRule } = useStore();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(empty());
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Timers that fire the intake BOTs after the drawer mounts. They used to leak: closing
  // the modal or unmounting the page left them queued against a stale task scope.
  const timers = useRef<number[]>([]);
  const currentUser =
    state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    if (open) {
      clearTimers();
      setForm(
        empty({
          requesterName: currentUser?.name ?? "",
          requesterEmail: currentUser?.email ?? "",
        }),
      );
      setErrors({});
    }
    // currentUser is read once per open; re-seeding on every store change would wipe typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const slaConfig = useMemo(
    () => state.slaConfigs.find((s) => s.category === form.category),
    [state.slaConfigs, form.category],
  );
  const suggestedSla =
    form.priority === "Critical"
      ? slaConfig?.criticalHours
      : form.priority === "High"
        ? slaConfig?.highHours
        : form.priority === "Medium"
          ? slaConfig?.mediumHours
          : slaConfig?.lowHours;

  const owningDept = state.organization.departments.find(
    (d) => d.id === CATEGORY_DEPARTMENT[form.category],
  );

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.title.trim().length < 8)
      e.title = "Enter a title of at least 8 characters.";
    if (form.description.trim().length < 20)
      e.description =
        "Describe the request in at least 20 characters so validation can pass.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.requesterEmail))
      e.requesterEmail = "Enter a valid email address.";
    if (!form.requesterName.trim())
      e.requesterName = "Requester name is required.";
    if (form.slaHours !== "" && Number(form.slaHours) <= 0)
      e.slaHours = "SLA must be greater than zero.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (runBots: boolean) => {
    if (!validate()) return;
    const task = createTask({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      source: form.source,
      requesterName: form.requesterName.trim(),
      requesterEmail: form.requesterEmail.trim(),
      slaHours: form.slaHours === "" ? undefined : Number(form.slaHours),
      status: "New",
    });
    onClose();

    if (runBots) {
      // Run the intake BOTs against this record only. The small delay lets the
      // drawer mount first so the reviewer can watch the automation trail appear.
      const rules = ["data_validation", "smart_assignment"]
        .map((key) => state.automations.find((a) => a.botKey === key))
        .filter((r): r is NonNullable<typeof r> => !!r && r.enabled);
      rules.forEach((rule, index) => {
        timers.current.push(
          window.setTimeout(
            () =>
              runRule(rule.id, {
                mode: "Simulated trigger",
                scopeTaskIds: [task.id],
              }),
            700 + index * 900,
          ),
        );
      });
    }
    navigate(`/tasks?task=${task.id}`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New operational request"
      description="Capture a request from any channel. Validation and assignment BOTs can run immediately after intake."
      size="lg"
      icon={
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Sparkles className="h-4 w-4" />
        </span>
      }
      footer={
        <>
          <span className="mr-auto hidden items-center gap-1.5 text-[11.5px] text-ink-500 sm:flex">
            <Wand2 className="h-3.5 w-3.5 text-brand-600" />
            Routes to{" "}
            <strong className="font-semibold text-ink-700">
              {owningDept?.name}
            </strong>{" "}
            · SLA {fmtHours(suggestedSla ?? 24)}
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => submit(false)}>
            Save draft
          </Button>
          <Button variant="primary" onClick={() => submit(true)}>
            Create &amp; run BOTs
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field
          label="Request title"
          required
          error={errors.title}
          htmlFor="qc-title"
        >
          <Input
            id="qc-title"
            value={form.title}
            invalid={!!errors.title}
            placeholder="e.g. VPN access failing for the new finance analyst"
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field
          label="Description"
          required
          error={errors.description}
          htmlFor="qc-desc"
          hint="Minimum 20 characters — the Data Validation BOT checks this."
        >
          <Textarea
            id="qc-desc"
            value={form.description}
            invalid={!!errors.description}
            placeholder="Describe the issue, the affected user and any context the assignee needs."
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-400">
            Routing
            <span className="h-px flex-1 bg-ink-100" />
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field label="Category" htmlFor="qc-cat">
              <Select
                id="qc-cat"
                value={form.category}
                onChange={(e) =>
                  setForm({ ...form, category: e.target.value as TaskCategory })
                }
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priority" htmlFor="qc-pri">
              <Select
                id="qc-pri"
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value as Priority })
                }
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Request source" htmlFor="qc-src">
              <Select
                id="qc-src"
                value={form.source}
                onChange={(e) =>
                  setForm({ ...form, source: e.target.value as RequestSource })
                }
              >
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="SLA duration (hours)"
              htmlFor="qc-sla"
              error={errors.slaHours}
              hint={`Suggested by SLA config for ${form.priority}: ${suggestedSla}h`}
            >
              <Input
                id="qc-sla"
                type="number"
                min={1}
                value={form.slaHours}
                placeholder={String(suggestedSla ?? 24)}
                invalid={!!errors.slaHours}
                onChange={(e) =>
                  setForm({
                    ...form,
                    slaHours:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Field>
          </div>
        </div>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[9.5px] font-semibold uppercase tracking-[0.09em] text-ink-400">
            Requester
            <span className="h-px flex-1 bg-ink-100" />
          </p>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <Field
              label="Requester name"
              required
              error={errors.requesterName}
              htmlFor="qc-req"
            >
              <Input
                id="qc-req"
                value={form.requesterName}
                invalid={!!errors.requesterName}
                onChange={(e) =>
                  setForm({ ...form, requesterName: e.target.value })
                }
              />
            </Field>
            <Field
              label="Requester email"
              required
              error={errors.requesterEmail}
              htmlFor="qc-email"
            >
              <Input
                id="qc-email"
                type="email"
                value={form.requesterEmail}
                invalid={!!errors.requesterEmail}
                onChange={(e) =>
                  setForm({ ...form, requesterEmail: e.target.value })
                }
              />
            </Field>
          </div>
        </div>
        <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3">
          <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-600">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span>
              Requests with missing fields or a likely duplicate are flagged by
              the Data Validation BOT instead of being auto-assigned. You will
              see the outcome immediately in the task timeline.
            </span>
          </p>
        </div>
      </div>
    </Modal>
  );
}
