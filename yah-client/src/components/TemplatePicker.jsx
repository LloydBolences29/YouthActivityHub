import { useEffect, useState } from "react";
import { gamePost, gameRequest } from "../api/gameSessions";
import TemplateEditor from "./TemplateEditor";
import { clearDraft, readDraft } from "../utils/templateDrafts";

export default function TemplatePicker({
  sessionId,
  userId,
  onSelected,
}) {
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState(null);
  const [refresh, setRefresh] = useState(0);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    setLoading(true);
    setMessage("");

    gameRequest(`/${sessionId}/templates`)
      .then((data) => {
        if (active) setTemplates(data.templates);
      })
      .catch((error) => {
        if (active) setMessage(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, refresh]);

  async function handleSelect(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await gamePost(`/${sessionId}/template`, {
        templateId: Number(selectedId),
      });

      const controller = await gameRequest(
        `/${sessionId}/controller`
      );

      onSelected(controller);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEdit(templateId) {
    setBusy(true);
    setMessage("");

    try {
      const data = await gameRequest(
        `/${sessionId}/templates/${templateId}`
      );

      setEditor({ template: data.template });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(template) {
    const confirmed = window.confirm(
      `Permanently delete “${template.title}” and its local editing draft? Existing games keep their selected copy.`
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    setNotice("");

    try {
      await gameRequest(
        `/${sessionId}/templates/${template.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: template.revision,
          }),
        }
      );

      const draftRemoved = clearDraft(userId, template.id);

      if (selectedId === String(template.id)) {
        setSelectedId("");
      }

      setNotice(
        draftRemoved
          ? "Template deleted."
          : "Template deleted, but its browser draft could not be removed."
      );

      setRefresh((value) => value + 1);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (editor) {
    return (
      <TemplateEditor
        key={editor.template?.templateId ?? "new"}
        sessionId={sessionId}
        userId={userId}
        initialTemplate={editor.template}
        onCancel={() => setEditor(null)}
        onCreated={(template) => {
          setSelectedId(String(template.id));
          setNotice(`“${template.title}” saved.`);
          setEditor(null);
          setRefresh((value) => value + 1);
        }}
      />
    );
  }

  const hasNewDraft = Boolean(readDraft(userId));

  return (
    <section className="template-picker">
      <h3>Choose your game pack</h3>

      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => {
          setNotice("");
          setEditor({ template: null });
        }}
      >
        {hasNewDraft ? "Resume new template draft" : "+ Create template"}
      </button>

      {notice && <p role="status">{notice}</p>}
      {message && <p role="alert">{message}</p>}

      {loading ? (
        <p>Loading templates…</p>
      ) : !templates.length ? (
        <p>No templates yet. Create your first game pack above.</p>
      ) : (
        <form onSubmit={handleSelect}>
          <fieldset disabled={busy}>
            <legend>Available templates</legend>

            {templates.map((template) => {
              const hasDraft =
                template.is_owner &&
                Boolean(readDraft(userId, template.id));

              return (
                <div className="template-list-item" key={template.id}>
                  <label className="template-option">
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={selectedId === String(template.id)}
                      onChange={(event) =>
                        setSelectedId(event.target.value)
                      }
                      required
                    />

                    <span>
                      <strong>{template.title}</strong>

                      <span className="template-description">
                        {template.description}
                      </span>

                      <small>
                        {template.regular_round_count} regular rounds
                        {" · "}
                        {template.fast_question_count} Fast Answer questions
                      </small>

                      {hasDraft && (
                        <span className="template-draft-badge">
                          Unsaved editing draft
                        </span>
                      )}
                    </span>
                  </label>

                  {template.is_owner && (
                    <div className="template-management-actions">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleEdit(template.id)}
                      >
                        {hasDraft ? "Resume editing" : "Edit"}
                      </button>

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleDelete(template)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            <button type="submit" disabled={busy || !selectedId}>
              {busy ? "Please wait…" : "Use this template"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}