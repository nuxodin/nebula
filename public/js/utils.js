
export * as dialog from 'https://cdn.jsdelivr.net/gh/u2ui/u2@x.x.x/js/dialog/dialog.js';

async function apiFetch(url, { method = 'GET', data, formData } = {}) {
    const isGet = method === 'GET';
    const headers = formData ? {} : { 'Content-Type': 'application/json' };
    const body = formData || (isGet ? null : JSON.stringify(data));

    const responst = await fetch(url, { method, headers, body });

    let result = null;
    try {
        result = await responst.json();
    } catch (error) {
        throw new Error(`${responst.status} ${responst.statusText} | ${error.message}`);
    }
    if (result.error) throw new Error(result.error);
    if (!responst.ok) throw new Error(`responst.ok = false, ${responst.status} ${responst.statusText}`);
    return result;
}

export const api = {
    get: (url) => apiFetch(url),
    post: (url, data) => apiFetch(url, { method: 'POST', data }),
    put: (url, data) => apiFetch(url, { method: 'PUT', data }),
    delete: (url) => apiFetch(url, { method: 'DELETE' }),
    formData: (url, formData) => apiFetch(url, { method: 'POST', formData })
};