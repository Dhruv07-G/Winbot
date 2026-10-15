import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("winbot", {
  command: (action: string, payload?: unknown) =>
    ipcRenderer.invoke("command", action, payload),
  on: (event: string, callback: (data: any) => void) => {
    if (!["state", "answer", "error", "cleared"].includes(event))
      throw new Error("Invalid event");
    const handler = (_: unknown, data: unknown) => callback(data);
    ipcRenderer.on(event, handler);
    return () => ipcRenderer.removeListener(event, handler);
  },
});
