# Microsoft authentication setup (required for online play)

TT Launcher uses **official Microsoft account sign-in**. It never asks for your Microsoft password inside a custom form.

## 1. Create an Azure App Registration

1. Open [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `TT Launcher` (or similar).
3. Supported account types: **Personal Microsoft accounts** (or multitenant + personal, depending on your tenant options).
4. Redirect URI: platform **Public client / native (mobile & desktop)**  
   Value example: `http://localhost` (msmc / Electron flows often use a localhost callback).
5. Register.

## 2. Configure the app

1. **Authentication** → enable **Allow public client flows** = Yes.
2. Copy the **Application (client) ID**.

## 3. Put the client ID in TT Launcher

1. Open TT Launcher → **Accounts**.
2. Paste the client ID → **Save**.
3. Click **Sign in with Microsoft** and complete the browser flow.

You can also set environment variable `TT_MS_CLIENT_ID` before starting the app.

## 4. Ownership

The signed-in Microsoft account must **own Minecraft Java Edition**. Accounts without entitlement cannot launch online-mode servers.

## Offline accounts

Offline profiles exist for **UI testing only**. They cannot join online-mode servers and are clearly labeled.
