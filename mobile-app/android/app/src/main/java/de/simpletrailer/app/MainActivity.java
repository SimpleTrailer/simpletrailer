package de.simpletrailer.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel bookings = new NotificationChannel(
            "bookings",
            "Buchungen",
            NotificationManager.IMPORTANCE_HIGH
        );
        bookings.setDescription("Erinnerungen zu deinen Anhänger-Buchungen, Pickup und Rückgabe.");
        bookings.enableLights(true);
        bookings.setLightColor(Color.parseColor("#E85D00"));
        bookings.enableVibration(true);
        nm.createNotificationChannel(bookings);

        NotificationChannel general = new NotificationChannel(
            "general",
            "Allgemein",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        general.setDescription("Allgemeine Hinweise und Updates von SimpleTrailer.");
        nm.createNotificationChannel(general);
    }
}
