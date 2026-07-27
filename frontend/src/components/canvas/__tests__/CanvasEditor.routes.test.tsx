import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasEditor } from "../CanvasEditor";
import { useCanvasStore, type CanvasProject } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

const submitNodeGenerationMock = vi.hoisted(() => vi.fn());
const pollNodeTaskMock = vi.hoisted(() => vi.fn());

vi.mock("../canvas-generation-service", async () => {
  const actual = await vi.importActual<typeof import("../canvas-generation-service")>("../canvas-generation-service");
  return {
    ...actual,
    submitNodeGeneration: submitNodeGenerationMock,
    pollNodeTask: pollNodeTaskMock,
  };
});

function textNode(id: string, title: string): CanvasNodeData {
  return {
    id,
    title,
    type: CanvasNodeType.Text,
    position: { x: 40, y: 40 },
    width: 240,
    height: 160,
    metadata: { content: title },
  };
}

const project: CanvasProject = {
  id: "route-project",
  title: "Prompt routes",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  nodes: [
    textNode("core", "核心提示词"),
    textNode("concept", "城市创意"),
    textNode("beijing", "北京专属"),
    {
      id: "config-1",
      title: "北京生成配置1",
      type: CanvasNodeType.Config,
      position: { x: 800, y: 40 },
      width: 360,
      height: 280,
      metadata: { composerContent: "胶片海报质感" },
    },
  ],
  connections: [
    { id: "core-concept", fromNodeId: "core", toNodeId: "concept" },
    { id: "concept-beijing", fromNodeId: "concept", toNodeId: "beijing" },
    { id: "core-beijing", fromNodeId: "core", toNodeId: "beijing" },
    { id: "beijing-config-1", fromNodeId: "beijing", toNodeId: "config-1" },
  ],
  backgroundMode: "lines",
  showImageInfo: false,
  viewport: { x: 0, y: 0, k: 1 },
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("CanvasEditor prompt routes", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    useCanvasStore.setState({ hydrated: true, projects: [structuredClone(project)] });
    submitNodeGenerationMock.mockReset();
    submitNodeGenerationMock.mockResolvedValue("task-1");
    pollNodeTaskMock.mockReset();
    pollNodeTaskMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("lists complete routes and persists the selected route on the config", async () => {
    render(
      <CanvasEditor
        projectId={project.id}
        onBack={() => undefined}
        onRequireApiKey={() => undefined}
        showToast={() => undefined}
      />,
    );

    const select = screen.getByRole("combobox", { name: "提示词路线" });
    fireEvent.click(select);
    const option = await screen.findByRole("option", { name: "核心提示词 -> 城市创意 -> 北京专属" });
    fireEvent.pointerDown(option);
    fireEvent.pointerUp(option);
    fireEvent.click(option);

    await waitFor(() => {
      const config = useCanvasStore.getState().openProject(project.id)?.nodes.find((node) => node.id === "config-1");
      expect(config?.metadata?.promptRouteSelection).toEqual({
        mode: "route",
        connectionIds: ["core-concept", "concept-beijing", "beijing-config-1"],
      });
    });
  });

  it("renames a node inline and refreshes route labels", async () => {
    const seeded = structuredClone(project);
    const core = seeded.nodes.find((node) => node.id === "core")!;
    core.title = "文本";
    useCanvasStore.setState({ hydrated: true, projects: [seeded] });

    const { container } = render(
      <CanvasEditor projectId={project.id} onBack={() => undefined} onRequireApiKey={() => undefined} showToast={() => undefined} />,
    );
    const coreNode = container.querySelector('[data-node-id="core"]')!;
    const getTitleHeader = () => within(coreNode as HTMLElement).getByTitle("双击重命名节点");

    fireEvent.doubleClick(getTitleHeader());
    const titleInput = within(coreNode as HTMLElement).getByRole("textbox", { name: "节点标题" });
    fireEvent.change(titleInput, { target: { value: "  核心提示词  " } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => {
      expect(getTitleHeader()).toHaveTextContent("核心提示词");
      expect(useCanvasStore.getState().openProject(project.id)?.nodes.find((node) => node.id === "core")?.title).toBe("核心提示词");
    });

    const select = screen.getByRole("combobox", { name: "提示词路线" });
    fireEvent.click(select);
    expect(await screen.findByRole("option", { name: "核心提示词 -> 城市创意 -> 北京专属" })).toBeInTheDocument();
    fireEvent.keyDown(select, { key: "Escape" });

    fireEvent.doubleClick(getTitleHeader());
    const cancelledInput = within(coreNode as HTMLElement).getByRole("textbox", { name: "节点标题" });
    fireEvent.change(cancelledInput, { target: { value: "取消后的标题" } });
    fireEvent.keyDown(cancelledInput, { key: "Escape" });
    expect(getTitleHeader()).toHaveTextContent("核心提示词");

    fireEvent.doubleClick(getTitleHeader());
    const emptyInput = within(coreNode as HTMLElement).getByRole("textbox", { name: "节点标题" });
    fireEvent.change(emptyInput, { target: { value: "   " } });
    fireEvent.blur(emptyInput);
    expect(getTitleHeader()).toHaveTextContent("核心提示词");
  });

  it("highlights the selected config route", () => {
    const seeded = structuredClone(project);
    const config = seeded.nodes.find((node) => node.id === "config-1")!;
    config.metadata = {
      ...config.metadata,
      promptRouteSelection: { mode: "route", connectionIds: ["core-concept", "concept-beijing", "beijing-config-1"] },
    };
    seeded.nodes.push(textNode("alternate", "备用路线"));
    seeded.connections.push({ id: "alternate-config", fromNodeId: "alternate", toNodeId: "config-1" });
    useCanvasStore.setState({ hydrated: true, projects: [seeded] });

    const { container } = render(
      <CanvasEditor projectId={project.id} onBack={() => undefined} onRequireApiKey={() => undefined} showToast={() => undefined} />,
    );
    fireEvent.pointerDown(container.querySelector('[data-node-id="config-1"]')!, { button: 0, clientX: 900, clientY: 100 });

    expect(container.querySelector('[data-node-id="core"]')).toHaveAttribute("data-route-active", "true");
    expect(container.querySelector('[data-node-id="concept"]')).toHaveAttribute("data-route-active", "true");
    expect(container.querySelector('[data-node-id="beijing"]')).toHaveAttribute("data-route-active", "true");
    expect(container.querySelector('[data-connection-id="core-concept"]')).toHaveAttribute("data-route-active", "true");
    expect(container.querySelector('[data-connection-id="core-beijing"]')).not.toHaveAttribute("data-route-active");
    const alternateHitPath = container.querySelector('[data-connection-id="alternate-config"]');
    expect(alternateHitPath?.nextElementSibling).toHaveAttribute("stroke", "var(--muted-foreground)");
  });

  it("marks a deleted selected route invalid and disables generation", () => {
    const seeded = structuredClone(project);
    seeded.connections = seeded.connections.filter((connection) => connection.id !== "core-concept");
    const config = seeded.nodes.find((node) => node.id === "config-1")!;
    config.metadata = {
      ...config.metadata,
      promptRouteSelection: { mode: "route", connectionIds: ["core-concept", "concept-beijing", "beijing-config-1"] },
    };
    useCanvasStore.setState({ hydrated: true, projects: [seeded] });

    render(<CanvasEditor projectId={project.id} onBack={() => undefined} onRequireApiKey={() => undefined} showToast={() => undefined} />);

    expect(screen.getByRole("combobox", { name: "提示词路线" })).toHaveTextContent("所选路线已失效，请重新选择");
    expect(screen.getByRole("button", { name: "生成" })).toBeDisabled();
  });

  it("generates from a selected route when the config supplement is empty", async () => {
    const seeded = structuredClone(project);
    const config = seeded.nodes.find((node) => node.id === "config-1")!;
    config.metadata = {
      ...config.metadata,
      composerContent: "",
      promptRouteSelection: { mode: "route", connectionIds: ["core-concept", "concept-beijing", "beijing-config-1"] },
    };
    useCanvasStore.setState({ hydrated: true, projects: [seeded] });

    render(<CanvasEditor projectId={project.id} onBack={() => undefined} onRequireApiKey={() => undefined} showToast={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "生成" }));

    await waitFor(() => {
      expect(submitNodeGenerationMock).toHaveBeenCalledWith(expect.objectContaining({
        prompt: "核心提示词\n\n城市创意\n\n北京专属",
      }));
    });
  });

  it("rebuilds the selected route prompt when retrying a result node", async () => {
    const seeded = structuredClone(project);
    const config = seeded.nodes.find((node) => node.id === "config-1")!;
    config.metadata = {
      ...config.metadata,
      composerContent: "",
      promptRouteSelection: { mode: "route", connectionIds: ["core-concept", "concept-beijing", "beijing-config-1"] },
    };
    seeded.nodes.push({
      id: "result",
      title: "生成结果",
      type: CanvasNodeType.Image,
      position: { x: 1200, y: 40 },
      width: 360,
      height: 360,
      metadata: { status: "error", prompt: "旧提示词" },
    });
    seeded.connections.push({ id: "config-result", fromNodeId: "config-1", toNodeId: "result" });
    useCanvasStore.setState({ hydrated: true, projects: [seeded] });

    render(<CanvasEditor projectId={project.id} onBack={() => undefined} onRequireApiKey={() => undefined} showToast={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => {
      expect(submitNodeGenerationMock).toHaveBeenCalledWith(expect.objectContaining({
        prompt: "核心提示词\n\n城市创意\n\n北京专属",
      }));
    });
  });
});
