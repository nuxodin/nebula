
export * as dialog from 'https://cdn.jsdelivr.net/gh/u2ui/u2@x.x.x/js/dialog/dialog.js';


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
            if (data.error) throw new Error(data.error);
            if (response.ok) return data;
            throw new Error(data.error || response.status + ' ' + response.statusText);
        }).catch(error => {
            if (response.status !== 400) {
                //throw new Error(response.status + ' ' + response.statusText);
            }
            throw error;
        });
    });
}


export const api = {
    get(url) {
        return apiFetch(url);
    },
    post(url, data = {}) {
        return apiFetch(url, { post: data });
    },
    put(url, data = {}) {
        return apiFetch(url, { put: data });
    },
    delete(url) {
        return apiFetch(url, { del: true });
    },
    formData(url, formData) {
        return apiFetch(url, { formData: formData });
    }
};