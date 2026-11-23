import { useEffect, useState } from "react";

const API = "/api/admin";

const emptyUser = {
  name: "",
  email: "",
  password: "",
  role: "facilitator",
};


// put these in vercel 
// NODE_ENV=production
// CLIENT_ORIGIN=https://your-app.vercel.app

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    throw error;
  }

  return data;
}

function post(path, body = {}) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export default function AdminPanel() {
  const [admin, setAdmin] = useState(null);
  const [checking, setChecking] = useState(true);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [form, setForm] = useState(emptyUser);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    request("/me")
      .then(({ user }) => {
        if (!cancelled) setAdmin(user);
      })
      .catch((error) => {
        if (!cancelled && ![401, 403].includes(error.status)) {
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      await post("/login", login);
      const { user } = await request("/me");
      setAdmin(user);
      setLogin({ email: "", password: "" });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const data = await post("/users", form);
      setForm({ ...emptyUser });
      setMessage(`Account created for ${data.user.name}.`);
    } catch (error) {
      setMessage(error.message);

      if ([401, 403].includes(error.status)) {
        setAdmin(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setMessage("");

    try {
      await post("/logout");
      setAdmin(null);
      setForm({ ...emptyUser });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <main className="container section">Loading…</main>;
  }

  return (
    <main className="container section">
      <div className="card" style={{ maxWidth: 560, marginInline: "auto" }}>
        <h2>{admin ? "Create a user" : "Admin login"}</h2>

        {message && <p role="status">{message}</p>}

        {!admin ? (
          <form onSubmit={handleLogin}>
            <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={login.email}
                onChange={(event) =>
                  setLogin({ ...login, email: event.target.value })
                }
              />

              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={login.password}
                onChange={(event) =>
                  setLogin({ ...login, password: event.target.value })
                }
              />

              <button type="submit" style={{ marginTop: "1rem" }}>
                {busy ? "Logging in…" : "Log in"}
              </button>
            </fieldset>
          </form>
        ) : (
          <>
            <p className="text-muted">Signed in as {admin.name}</p>

            <form onSubmit={handleCreate}>
              <fieldset disabled={busy} style={{ border: 0, padding: 0 }}>
                <label htmlFor="user-name">Full name</label>
                <input
                  id="user-name"
                  required
                  maxLength={100}
                  autoComplete="off"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                />

                <label htmlFor="user-email">Email</label>
                <input
                  id="user-email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="off"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />

                <label htmlFor="user-password">Password</label>
                <input
                  id="user-password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
                <p className="text-muted">Use 12–128 characters.</p>

                <label htmlFor="user-role">Role</label>
                <select
                  id="user-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm({ ...form, role: event.target.value })
                  }
                >
                  <option value="facilitator">Facilitator</option>
                  <option value="admin">Admin</option>
                </select>

                <button type="submit" style={{ marginTop: "1rem" }}>
                  {busy ? "Saving…" : "Create user"}
                </button>
              </fieldset>
            </form>

            <button
              type="button"
              className="btn-secondary"
              disabled={busy}
              onClick={handleLogout}
              style={{ marginTop: "1rem" }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </main>
  );
}