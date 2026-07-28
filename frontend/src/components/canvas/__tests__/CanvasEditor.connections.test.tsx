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

  it("copies the connections internal to a multi-node selection", async () => {
    const { container } = renderEditor();
    const nodeA = container.querySelector<HTMLElement>('[data-node-id="node-a"]')!;
    const nodeB = container.querySelector<HTMLElement>('[data-node-id="node-b"]')!;

    fireEvent.pointerDown(nodeA, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(nodeB, { button: 0, ctrlKey: true, clientX: 440, clientY: 20 });
    fireEvent.pointerUp(window);
    fireEvent.keyDown(window, { key: "c", ctrlKey: true });
    fireEvent.keyDown(window, { key: "v", ctrlKey: true });

    await waitFor(() => {
      const saved = useCanvasStore.getState().openProject(project.id)!;
      expect(saved.nodes).toHaveLength(4);
      expect(saved.connections).toHaveLength(2);
      const clonedIds = saved.nodes.filter((node) => node.id !== "node-a" && node.id !== "node-b").map((node) => node.id);
      expect(saved.connections.some((connection) => clonedIds.includes(connection.fromNodeId) && clonedIds.includes(connection.toNodeId))).toBe(true);
    });
  });

  it("aligns selected nodes from the arrange menu", async () => {
    const { container } = renderEditor();
    const nodeA = container.querySelector<HTMLElement>('[data-node-id="node-a"]')!;
    const nodeB = container.querySelector<HTMLElement>('[data-node-id="node-b"]')!;
    fireEvent.pointerDown(nodeA, { button: 0, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(nodeB, { button: 0, ctrlKey: true, clientX: 440, clientY: 20 });
    fireEvent.pointerUp(window);

    fireEvent.click(screen.getByRole("button", { name: "排列节点" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "左对齐" }));

    await waitFor(() => {
      const saved = useCanvasStore.getState().openProject(project.id)!;
      expect(saved.nodes.find((node) => node.id === "node-a")?.position.x).toBe(0);
      expect(saved.nodes.find((node) => node.id === "node-b")?.position.x).toBe(0);
    });
  });

  it("creates a node at the right-clicked canvas position", async () => {
    const { container } = renderEditor();
    const canvas = container.querySelector<HTMLElement>(".cursor-grab")!;

    fireEvent.contextMenu(canvas, { clientX: 300, clientY: 260 });
    fireEvent.click(await screen.findByRole("button", { name: "在此添加文本节点" }));

    await waitFor(() => {
      const saved = useCanvasStore.getState().openProject(project.id)!;
      expect(saved.nodes).toHaveLength(3);
      const createdNode = saved.nodes[2];
      expect({
        x: createdNode.position.x + createdNode.width / 2,
        y: createdNode.position.y + createdNode.height / 2,
      }).toEqual({ x: 300, y: 260 });
    });
  });
});
