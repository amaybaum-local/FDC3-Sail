interface Window {
    readonly home: { getApps: () => Promise<unknown>; };
    readonly fdc3: import("/Users/nicholaskolba/connectifi/electron-fdc3/node_modules/@finos/fdc3/dist/api/DesktopAgent").DesktopAgent;
    readonly sail: { isConnected: () => boolean; isReady: () => void; joinChannel: (channel: string) => void; leaveChannel: () => void; hideWindow: () => void; resolveIntent: (data: any) => void; versions: NodeJS.ProcessVersions; getApps: () => Promise<unknown>; tabs: { select: (selectedId: string) => void; tearOut: (tabId: string) => void; new: () => void; drop: (frameTarget: boolean) => void; dragStart: (selected: string) => void; close: (tabId: string) => void; }; menu: { openTools: (clientX: number, clientY: number) => void; openChannelPicker: (mouseX: number, mouseY: number) => void; }; search: { hideResultsWindow: () => void; searchDirectory: (query: string) => void; selectResult: (selection: string) => void; }; };
}
