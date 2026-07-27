import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasEditor } from "../CanvasEditor";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType } from "../types";

const project: CanvasProject = {
  id: "project-1",
  title: "Connection deletion",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  nodes: [
    {
      id: "node-a",
      type: CanvasNodeType.Text,
      title: "A",
      position: { x: 0, y: 0 },
      width: 240,
      height: 160,
      metadata: { content: "A" },
    },
    {
      id: "node-b",
      type: CanvasNodeType.Text,
      title: "B",
      position: { x: 420, y: 0 },
      width: 240,
      height: 160,
      metadata: { content: "B" },
    },
  ],
  connections: [{ id: "connection-1", fromNodeId: "node-a", toNodeId: "node-b" }],
  backgroundMode: "lines",
  showImageInfo: false,
  viewport: { x: 0, y: 0, k: 1 },
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("CanvasEditor connections", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    useCanvasStore.setState({ hydrated: true, projects: [project] });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderEditor() {
    return render(
      <CanvasEditor
        projectId={project.id}
        onBack={() => undefined}
        onRequireApiKey={() => undefined}
        showToast={() => undefined}
      />,
    );
  }

  it("deletes the selected connection with the Delete key", async () => {
    const { container } = renderEditor();

    const connection = container.querySelector<SVGPathElement>('[data-connection-id="connection-1"]');
    expect(connection).not.toBeNull();

    fireEvent.click(connection!);
    fireEvent.keyDown(window, { key: "Delete" });

    await waitFor(() => {
      expect(useCanvasStore.getState().openProject(project.id)?.connections).toHaveLength(0);
    });
  });

  it("deletes the selected connection from the toolbar", async () => {
    const { container } = renderEditor();
    const connection = container.querySelector<SVGPathElement>('[data-connection-id="connection-1"]');
    expect(connection).not.toBeNull();

    fireEvent.click(connection!);
    fireEvent.click(screen.getByRole("button", { name: "删除选中" }));

    await waitFor(() => {
      expect(useCanvasStore.getState().openProject(project.id)?.connections).toHaveLength(0);
    });
  });
});
