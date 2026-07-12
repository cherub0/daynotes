(() => {
  const settings = {
    email: { smtp_host: "smtp.qq.com", smtp_port: 465, username: "", password: "", recipient: "", send_time: "08:00", weekdays_only: true, enabled: false },
    theme: "light",
    font_size: 14,
  };
  const notes = {};
  window.__TAURI_INTERNALS__ = {
    transformCallback: () => Math.floor(Math.random() * 1e9),
    unregisterCallback: () => {},
    convertFileSrc: (filePath) => filePath,
    invoke: async (cmd, args = {}) => {
      if (cmd === "get_settings") return settings;
      if (cmd === "get_notes_dates") return Object.keys(notes);
      if (cmd === "get_note") return notes[args.date] || null;
      if (cmd === "save_note") { notes[args.date] = args; return null; }
      if (cmd === "send_daily_email") return "mock email sent";
      if (cmd === "plugin:dialog|save") return null;
      if (cmd === "plugin:dialog|open") return null;
      throw new Error(`agent-browser mock does not handle ${cmd}`);
    },
  };
})();
