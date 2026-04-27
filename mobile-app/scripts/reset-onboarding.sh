#!/usr/bin/env bash
# Onboarding zuruecksetzen, damit es beim naechsten App-Start wieder erscheint
# (Hilfreich beim Testen der Onboarding-Screens)
echo "Auf einem verbundenen Android-Geraet/Emulator:"
echo "  adb shell pm clear de.simpletrailer.app"
echo
echo "Hinweis: das loescht ALLE App-Daten (Login, Cookies, etc.) — also nur fuer Testen sinnvoll."
echo
echo "Auf iOS: App loeschen und neu installieren."
