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
        return response.json().then(data => {
            if (response.ok) return data;
            if (data.error) throw new Error(data.error);
            throw new Error(data.error || response.status + ' ' + response.statusText);
        }).catch(error => {
            if (response.status !== 400) {
                throw new Error(response.status + ' ' + response.statusText);
            }
            throw error;
        });
    });
}
