"use client";
/**
 * Schema Mapper — main page.
 *
 * Wires the MappingList (left rail) and the per-mapping Workspace (right pane)
 * to the `useMapping` hook which talks to the `/api/v1/mappings` API.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";

import { useMapping } from "./hooks/useMapping";
import { classNames } from "./lib/format";
import { useWorkspaceLayout, type PanelLayout, type PanelState } from "../hooks/useWorkspaceLayout";
import Panel from "../components/Panel";
import { EmptyState, LoadingState, SegmentedControl, WorkspaceHeader as PageHeader } from "../components";

import MappingList from "./components/MappingList";
import WorkspaceHeader from "./components/WorkspaceHeader";
import DraftBar from "./components/DraftBar";
import Canvas from "./components/Canvas";
import SuggestionPanel from "./components/SuggestionPanel";
import EdgeInspector from "./components/EdgeInspector";
import CommentsPanel from "./components/CommentsPanel";
import VersionHistoryPanel from "./components/VersionHistoryPanel";
import ValidationPanel from "./components/ValidationPanel";
import TransformEditor from "./components/TransformEditor";
import PublishDialog from "./components/PublishDialog";
import ExportModal from "./components/ExportModal";
import Toast from "./components/Toast";

export default function SchemaMapperPage() {
  const router = useRouter();
  const m = useMapping();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [transformEdit, setTransformEdit] = useState<{
    initial: import("./lib/types").TransformationPayload;
    edgeId: number;
  } | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  // Focus mode hides the mapping list rail and collapses the docked side
  // panels so the canvas gets more room (uiux bug report: "canvas is so
  // small"). Rendering-only override, not persisted through
  // workspaceLayout — the user's saved Properties/Comments/History
  // preferences must survive turning focus mode back off.
  const [focusMode, setFocusMode] = useState(false);

  // Manual canvas vs. AI-suggested fields, toggled the same way Query
  // Workspace switches Ask/SQL: a WorkspaceHeader SegmentedControl, both
  // views kept permanently mounted and shown/hidden with a `hidden` class
  // rather than conditional rendering, so switching back and forth never
  // re-fetches Canvas's schema or loses staged sources / suggestion state.
  const [mappingMode, setMappingMode] = useState<"manual" | "ai_suggested">("manual");
  // Background-completion indicator on the "AI Suggested" segment, mirroring
  // Query Workspace's bgAskComplete/bgSqlComplete: if a suggestion run
  // finishes while the user is looking at the canvas, a dot says so instead
  // of the result being silently invisible until they happen to switch tabs.
  const [aiSuggestedIndicator, setAiSuggestedIndicator] = useState(false);
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    const wasGenerating = wasGeneratingRef.current;
    wasGeneratingRef.current = m.generatingSuggestions;
    if (wasGenerating && !m.generatingSuggestions && mappingMode !== "ai_suggested") {
      setAiSuggestedIndicator(true);
      const timer = setTimeout(() => setAiSuggestedIndicator(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [m.generatingSuggestions, mappingMode]);

  const handleModeChange = (next: "manual" | "ai_suggested") => {
    setMappingMode(next);
    if (next === "ai_suggested") setAiSuggestedIndicator(false);
  };

  const workspaceLayout = useWorkspaceLayout("schema-mapper", {
    properties: { state: "normal", width: 288 },
    comments: { state: "collapsed", width: 260 },
    history: { state: "collapsed", width: 300 },
  });
  const propertiesPanel = workspaceLayout.panels.properties ?? { state: "normal", width: 288 };
  const commentsPanel = workspaceLayout.panels.comments ?? { state: "collapsed", width: 260 };
  const historyPanel = workspaceLayout.panels.history ?? { state: "collapsed", width: 300 };
  // Focus mode forces every docked side panel closed for display purposes
  // only — onStateChange still calls the real updatePanel, so a user who
  // deliberately reopens one while focused keeps that as their saved
  // preference once focus mode is turned back off.
  const displayPanelState = (p: PanelLayout): PanelState =>
    focusMode ? "collapsed" : p.state;

  // Redirect to login if the role check returns 401.
  useEffect(() => {
    if (m.error && m.error.toLowerCase().includes("not authenticated")) {
      router.push("/login");
    }
  }, [m.error, router]);

  // Load the selected mapping.
  useEffect(() => {
    if (selectedId !== null) void m.load(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const mapping = m.mapping;
  const canEdit = !!mapping && mapping.status === "draft" &&
    (m.role === "admin" || m.role === "analyst");
  const selectedEdge = m.edges.find((e) => e.id === m.selectedEdgeId) ?? null;
  // Suggestions are a draft-only workflow (publish supersedes every pending
  // suggestion server-side); a published mapping has nothing to show in
  // "AI Suggested" mode, so it always falls back to the canvas regardless
  // of whatever the user last picked on a draft mapping.
  const effectiveMappingMode = mapping?.status === "draft" ? mappingMode : "manual";

  const handleValidate = async () => {
    setValidating(true);
    try {
      await m.validate();
    } finally {
      setValidating(false);
    }
  };

  const handlePublishClick = () => {
    setPublishError(null);
    setPublishOpen(true);
  };

  const handlePublishConfirm = async () => {
    setPublishing(true);
    setPublishError(null);
    try {
      await m.publish();
      setPublishOpen(false);
    } catch (err) {
      // The hook already toasted this, but a toast auto-dismisses after 5s
      // and the dialog otherwise gives no sign anything happened — leaving
      // it open with no visible reason is exactly what read as "stuck" in
      // the uiux bug report. Keep the dialog open with a persistent reason
      // instead (m.publish() also refreshes the blocking/warning counts
      // shown above this banner when the failure was a validation 422).
      setPublishError(
        err instanceof ApiError ? err.message : "Publish failed. Please try again.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const handleExportClick = async () => {
    setExportOpen(true);
    if (mapping) {
      setExportLoading(true);
      try {
        await m.loadExport(mapping.current_version_id ?? undefined);
      } finally {
        setExportLoading(false);
      }
    }
  };

  const handleExportClose = () => {
    setExportOpen(false);
    m.clearExport();
  };

  const handleJumpToEdge = (edgeId: number) => {
    m.selectEdge(edgeId);
  };

  return (
    <div className="workspace-page flex h-full flex-col">
      <PageHeader
        eyebrow="Schema Intelligence"
        title="Schema Mapper"
        description="Design versioned, audited field mappings with drag-and-drop, validation, and assisted matching."
        className="shrink-0 border-b border-border bg-glass-bg-strong px-4 py-4 backdrop-blur-xl md:px-6"
        actions={
          mapping?.status === "draft" ? (
            <SegmentedControl
              label="Schema mapper mode"
              value={mappingMode}
              onChange={handleModeChange}
              options={[
                { value: "manual", label: "Manual" },
                { value: "ai_suggested", label: "AI Suggested", indicator: aiSuggestedIndicator },
              ]}
            />
          ) : undefined
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Focus mode hides the mapping list rail entirely to give the
            canvas maximal width (uiux bug report: "canvas is so small") —
            the user exits focus mode to switch mappings again. */}
        {!focusMode && (
          <MappingList
            selectedId={selectedId}
            onSelect={(id) => setSelectedId(id)}
            onCreate={m.create}
            role={m.role}
            renamedMappingId={mapping?.id ?? null}
            renamedMappingName={mapping?.name ?? null}
          />
        )}

        {!mapping ? (
          <div className="flex flex-1 items-center justify-center p-6">
            {selectedId === null ? (
              <EmptyState icon="🗺️" title="Select or create a mapping" description="Choose a draft or published mapping from the list, or create a new mapping to begin." className="w-full max-w-lg" />
            ) : (
              <LoadingState label="Loading mapping…" className="w-full max-w-lg" />
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <WorkspaceHeader
              mapping={mapping}
              role={m.role}
              validation={m.validation}
              onValidate={handleValidate}
              onPublish={handlePublishClick}
              onExport={handleExportClick}
              onRename={(name) => m.rename(name)}
              onReviewTransitioned={m.refresh}
              onRevise={m.revise}
              validating={validating}
              publishing={publishing}
              focusMode={focusMode}
              onToggleFocusMode={() => setFocusMode((f) => !f)}
            />
            <DraftBar
              dirty={m.dirty}
              saving={m.saving}
              lastSavedAt={m.lastSavedAt}
              error={m.error}
            />
            <div className="relative flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Both modes stay mounted and are shown/hidden with a
                    `hidden` class (never conditionally unmounted) — the same
                    technique Query Workspace uses for its Ask/SQL toggle —
                    so switching back and forth never re-fetches Canvas's
                    schema or discards staged sources / suggestion state. */}
                <div
                  className={classNames(
                    "flex-1 flex flex-col overflow-hidden",
                    effectiveMappingMode === "manual" ? "" : "hidden",
                  )}
                >
                  <Canvas
                    mappingId={mapping.id}
                    edges={m.edges}
                    selectedEdgeId={m.selectedEdgeId}
                    canEdit={canEdit}
                    role={m.role}
                    onSelectEdge={(id) => m.selectEdge(id)}
                    onCreateEdge={(target, sources, transformation) =>
                      // mapper_tasks #1: Canvas now computes the right
                      // transformation (direct for 1 source, concat for
                      // 2+) and needs the created edge back to auto-select
                      // multi-source edges for review.
                      m.addEdge({ target, sources, transformation })
                    }
                    onHint={m.hint}
                  />
                  {m.validation && (
                    <ValidationPanel
                      validation={m.validation}
                      onClose={m.clearValidation}
                      onJumpToEdge={handleJumpToEdge}
                      edges={m.edges}
                      suggestions={m.suggestions}
                      sourceConnectionId={mapping?.source_id}
                    />
                  )}
                </div>
                {/* Suggestions are a draft-only workflow: publish supersedes
                    every pending suggestion server-side, and a published
                    mapping is immutable — so no suggestion UI (historical
                    or otherwise) is shown once a mapping is published. */}
                {mapping.status === "draft" && (
                  <div
                    className={classNames(
                      "flex-1 flex flex-col overflow-hidden",
                      effectiveMappingMode === "ai_suggested" ? "" : "hidden",
                    )}
                  >
                    <SuggestionPanel
                      pending={m.pendingSuggestions}
                      decided={m.decidedSuggestions}
                      loading={m.generatingSuggestions}
                      role={m.role}
                      onRequest={m.requestSuggestions}
                      onAccept={(id, transformation) => m.acceptSuggestion(id, transformation)}
                      onReject={(id) => m.rejectSuggestion(id)}
                      sourceConnectionId={mapping?.source_id}
                    />
                  </div>
                )}
              </div>
              <Panel
                title="Properties"
                state={displayPanelState(propertiesPanel)}
                onStateChange={(state) => workspaceLayout.updatePanel("properties", { state })}
                width={propertiesPanel.width}
                onWidthChange={(width) => workspaceLayout.updatePanel("properties", { width })}
              >
                <EdgeInspector
                  edge={selectedEdge}
                  mappingId={mapping?.id ?? null}
                  role={m.role}
                  canEdit={canEdit}
                  onEdit={(t) => {
                    if (!selectedEdge) return;
                    setTransformEdit({ initial: t, edgeId: selectedEdge.id });
                  }}
                  onDelete={async () => {
                    if (!selectedEdge) return;
                    if (confirm(`Delete edge ${selectedEdge.target.table}.${selectedEdge.target.column}?`)) {
                      await m.removeEdge(selectedEdge.id);
                    }
                  }}
                />
              </Panel>
              <Panel
                title="Comments"
                state={displayPanelState(commentsPanel)}
                onStateChange={(state) => workspaceLayout.updatePanel("comments", { state })}
                width={commentsPanel.width}
                onWidthChange={(width) => workspaceLayout.updatePanel("comments", { width })}
              >
                <CommentsPanel
                  mappingId={mapping.id}
                  role={m.role}
                  currentUserEmail={m.currentUserEmail}
                />
              </Panel>
              <Panel
                title="History"
                state={displayPanelState(historyPanel)}
                onStateChange={(state) => workspaceLayout.updatePanel("history", { state })}
                width={historyPanel.width}
                onWidthChange={(width) => workspaceLayout.updatePanel("history", { width })}
              >
                <VersionHistoryPanel
                  mappingId={mapping.id}
                  role={m.role}
                  onRolledBack={m.refresh}
                />
              </Panel>
            </div>
          </div>
        )}
      </div>

      <Toast toast={m.toast} onDismiss={m.clearToast} />

      {transformEdit && (
        <TransformEditor
          initial={transformEdit.initial}
          onCancel={() => setTransformEdit(null)}
          onApply={(next) => {
            void m.updateTransformation(transformEdit.edgeId, next);
            setTransformEdit(null);
          }}
        />
      )}

      {publishOpen && mapping && (
        <PublishDialog
          open
          blockingCount={m.validation?.blocking_count ?? 0}
          warningCount={m.validation?.warning_count ?? 0}
          currentVersionId={mapping.current_version_id}
          onCancel={() => !publishing && setPublishOpen(false)}
          onConfirm={handlePublishConfirm}
          publishing={publishing}
          error={publishError}
        />
      )}

      {exportOpen && (
        <ExportModal
          open
          artifact={m.exportArtifact}
          loading={exportLoading}
          versionId={m.exportVersionId}
          onClose={handleExportClose}
        />
      )}

      {/* Accessibility live region for status updates. */}
      <div className={classNames("sr-only")} aria-live="polite">
        {m.toast?.message ?? ""}
      </div>
    </div>
  );
}
