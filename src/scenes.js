// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The text
// fields are rendered by Gladys first, so a scene variable fits
// (`{{triggerEvent.data.subject}}`, a sensor value…).
//
//   - `create_issue`: open an issue in a project, authored by the user of the
//     key (a leak detected, a freezer too warm, a printer out of toner);
//   - `add_note`: add a note to an issue (the device came back, the issue
//     created earlier in the scene gets the news).
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async create_issue(hub, { fields = {} }) {
    const { id, url } = await hub.createIssue(fields);
    return { issue_id: id, url };
  },

  async add_note(hub, { fields = {} }) {
    const { id, subject } = await hub.addNote(fields);
    return { issue_id: id, subject };
  },
};
