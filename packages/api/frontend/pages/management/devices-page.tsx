import Layout from "../../components/layout/Layout";
import Planned from "../../components/Planned";

/** Announces the planned device administration. Managment role only. */
export default function ManageDevicesPage() {
  return (
    <Layout>
      <Planned
        title="Geräte verwalten"
        intro={
          <>
            Geräte hier anlegen, umbenennen und entfernen, statt dafür in die
            TTN-Console zu wechseln. Die Seite wird dazu die REST-API von The
            Things Network ansprechen; die Geräte selbst bleiben in TTN
            registriert, diese Anwendung sieht sie nur.
          </>
        }
        features={[
          {
            label: "Gerät anlegen",
            description:
              "Ein neues Gerät in der TTN-Application registrieren – DevEUI, JoinEUI und AppKey eintragen oder erzeugen lassen.",
          },
          {
            label: "Gerät umbenennen",
            description:
              "Die Bezeichnung eines Geräts ändern, ohne seine Messdaten zu berühren.",
          },
          {
            label: "Gerät entfernen",
            description:
              "Ein Gerät aus TTN löschen. Die bereits empfangenen Messwerte bleiben in der Datenbank erhalten.",
          },
          {
            label: "Übersicht",
            description:
              "Die in TTN registrierten Geräte neben denen anzeigen, von denen tatsächlich Messwerte eintreffen – so fallen Karteileichen auf.",
          },
        ]}
        note={
          <>
            Dafür braucht der Server einen TTN-API-Schlüssel mit Schreibrechten
            auf die Application. Bis der konfiguriert ist, bleibt die Seite eine
            Ankündigung.
          </>
        }
      />
    </Layout>
  );
}
