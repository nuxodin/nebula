export function apiFetch(url, { method, data } = {}) {
    if (method == null) {
        method = data ? 'POST' : 'GET';
    }
    return fetch(url, {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    }).then(response => {
        if (response.ok) {
            return response.json();
        }
        if (response.status !== 400) {
            throw new Error(response.status + ' ' + response.statusText);
        }
        return response.json().then(error => {
            throw new Error(error.message || 'unknown error');
        });
    });
}
