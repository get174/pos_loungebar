package com.posloungebar.cashier;

import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "PosDevice")
public class PosDevicePlugin extends Plugin {
    private static final String ALIAS = "pos-device-connection-v1";
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
    @PluginMethod
    public void getConnection(PluginCall call) {
        try {
            String value = getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE).getString("connection", null);
            JSObject result = new JSObject();
            if (value == null) result.put("value", org.json.JSONObject.NULL);
            else {
                String[] parts = value.split(":", 2);
                Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
                cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
                result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), java.nio.charset.StandardCharsets.UTF_8));
            }
            call.resolve(result);
        } catch (Exception error) { call.reject("Impossible de lire l’association de cette caisse."); }
    }
    @PluginMethod
    public void setConnection(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.length() > 4096) { call.reject("Configuration invalide."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            String encrypted = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" +
                Base64.encodeToString(cipher.doFinal(value.getBytes(java.nio.charset.StandardCharsets.UTF_8)), Base64.NO_WRAP);
            if (!getContext().getSharedPreferences(ALIAS, Context.MODE_PRIVATE).edit().putString("connection", encrypted).commit()) {
                call.reject("Impossible d’enregistrer cette caisse."); return;
            }
            call.resolve();
        } catch (Exception error) { call.reject("Impossible d’enregistrer cette caisse."); }
    }
    @PluginMethod
    public void printReceipt(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.length() > 256 * 1024) { call.reject("Ticket invalide."); return; }
        getActivity().runOnUiThread(() -> {
            WebView view = new WebView(getActivity());
            view.getSettings().setJavaScriptEnabled(false);
            view.getSettings().setAllowFileAccess(false);
            view.getSettings().setAllowContentAccess(false);
            view.setWebViewClient(new WebViewClient() {
                private boolean opened = false;
                @Override public void onPageFinished(WebView web, String url) {
                    if (opened) return;
                    opened = true;
                    try {
                        PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adapter = web.createPrintDocumentAdapter("Ticket POS");
                        manager.print("Ticket POS", new PrintDocumentAdapter() {
                            @Override public void onStart() { adapter.onStart(); }
                            @Override public void onLayout(PrintAttributes oldAttrs, PrintAttributes newAttrs, CancellationSignal signal, LayoutResultCallback callback, Bundle extras) { adapter.onLayout(oldAttrs, newAttrs, signal, callback, extras); }
                            @Override public void onWrite(android.print.PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal, WriteResultCallback callback) { adapter.onWrite(pages, destination, signal, callback); }
                            @Override public void onFinish() { adapter.onFinish(); web.destroy(); }
                        }, new PrintAttributes.Builder().build());
                        JSObject result = new JSObject();
                        result.put("success", true); result.put("cancelled", false); call.resolve(result);
                    } catch (Exception error) { web.destroy(); call.reject("Service d’impression Android indisponible. Le paiement reste enregistré."); }
                }
            });
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
