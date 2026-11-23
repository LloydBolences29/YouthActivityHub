export async function gameRequest(path, options = {}) {
  const response = await fetch(`/api/game-sessions${path}`, {
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

export function gamePost(path, body = {}) {
  return gameRequest(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}