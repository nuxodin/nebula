export function apiFetch(url, { method, post, put, del, formData } = {}) {
    let data = null;
    if (method == null) {
        method = post ? 'POST' : put ? 'PUT' : del ? 'DELETE' : 'GET';
    }
    data = post || put || del;

    let headers = {};
    let body = null;

    if (formData) {
        method = 'POST';
        body = formData;
    } else {
        headers = { 'Content-Type': 'application/json' };
        body = JSON.stringify(data);
    }

    return fetch(url, { method, headers, body }).then(response => {
        return response.json().then(data => {
            if (response.ok) return data;
            if (data.error) throw new Error(data.error);
            throw new Error(data.error || response.status + ' ' + response.statusText);
        }).catch(error => {
            throw error;
            if (response.status !== 400) {
                throw new Error(response.status + ' ' + response.statusText);
            }
        });
    });
}
