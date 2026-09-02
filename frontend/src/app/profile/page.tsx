"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AuthGate } from "@/components/AuthGate";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/api";
import { getToken, getUser, setSession, type AuthUser, updateStoredUser } from "@/lib/auth";

type FormState = {
  name: string;
  businessName: string;
  phone: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  preferredLanguage: "Hinglish" | "English";
  whatsappBusinessNumber: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    businessName: "",
    phone: "",
    gstin: "",
    address: "",
    city: "",
    state: "",
    pincode: "",
    preferredLanguage: "Hinglish",
    whatsappBusinessNumber: "",
  };
}

function fromUser(user: AuthUser | null): FormState {
  if (!user) return emptyForm();
  return {
    name: user.name || "",
    businessName: user.businessName || "",
    phone: user.phone || "",
    gstin: user.gstin || "",
    address: user.address || "",
    city: user.city || "",
    state: user.state || "",
    pincode: user.pincode || "",
    preferredLanguage: user.preferredLanguage === "English" ? "English" : "Hinglish",
    whatsappBusinessNumber: user.whatsappBusinessNumber || "",
  };
}

function ProfileInner() {
  const cached = getUser();
  const [email, setEmail] = useState(cached?.email || "");
  const [form, setForm] = useState<FormState>(() => fromUser(cached));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "ok" | "error"; text: string } | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.me();
        if (cancelled) return;
        setEmail(res.user.email);
        setForm(fromUser(res.user));
        const token = getToken();
        if (token) setSession(token, res.user);
        else updateStoredUser(res.user);
      } catch (err) {
        if (!cancelled) {
          setToast({
            type: "error",
            text: err instanceof Error ? err.message : "Failed to load profile",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      const res = await api.updateProfile({
        name: form.name.trim(),
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        gstin: form.gstin.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        preferredLanguage: form.preferredLanguage,
        whatsappBusinessNumber: form.whatsappBusinessNumber.trim(),
      });
      updateStoredUser(res.user);
      setForm(fromUser(res.user));
      setToast({ type: "ok", text: "Profile saved." });
    } catch (err) {
      setToast({
        type: "error",
        text: err instanceof Error ? err.message : "Could not save profile",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <main className="main">
        <header className="topbar">
          <div>
            <h1>Merchant profile</h1>
          </div>
        </header>

        {toast && (
          <div className={`toast ${toast.type === "error" ? "error" : ""}`}>
            {toast.text}
          </div>
        )}

        {loading ? (
          <div className="panel">
            <p className="muted">Loading profile…</p>
          </div>
        ) : (
          <form className="panel profile-panel" onSubmit={handleSubmit}>
            <div className="profile-banner">
              <div>
                <strong>{form.businessName || form.name || "Merchant"}</strong>
                <span className="muted">{email}</span>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="name">Contact name</label>
                <input
                  id="name"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="businessName">Business name</label>
                <input
                  id="businessName"
                  value={form.businessName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, businessName: e.target.value }))
                  }
                  placeholder="Legal / trade name"
                />
              </div>
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91…"
                />
              </div>
              <div className="field">
                <label htmlFor="whatsappBusinessNumber">WhatsApp business number</label>
                <input
                  id="whatsappBusinessNumber"
                  value={form.whatsappBusinessNumber}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      whatsappBusinessNumber: e.target.value,
                    }))
                  }
                  placeholder="+91…"
                />
              </div>
              <div className="field">
                <label htmlFor="gstin">GSTIN</label>
                <input
                  id="gstin"
                  value={form.gstin}
                  onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
              <div className="field">
                <label htmlFor="preferredLanguage">Preferred outreach language</label>
                <select
                  id="preferredLanguage"
                  value={form.preferredLanguage}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      preferredLanguage: e.target.value as FormState["preferredLanguage"],
                    }))
                  }
                >
                  <option value="Hinglish">Hinglish</option>
                  <option value="English">English</option>
                </select>
              </div>
              <div className="field full">
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="city">City</label>
                <input
                  id="city"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="state">State</label>
                <input
                  id="state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                />
              </div>
              <div className="field">
                <label htmlFor="pincode">Pincode</label>
                <input
                  id="pincode"
                  value={form.pincode}
                  onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
                />
              </div>
            </div>

            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </main>
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <AuthGate>
      <ProfileInner />
    </AuthGate>
  );
}
