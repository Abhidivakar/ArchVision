/**
 * Browser Notification Utility
 * Provides methods for requesting permission and sending OS-level notifications.
 */

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("This browser does not support desktop notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
};

export const sendNotification = (title: string, body: string) => {
  if (typeof window === "undefined" || !("Notification" in window)) return;

  if (Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico", // Attempt to use the favicon as the notification icon
      });
    } catch (e) {
      console.error("Failed to send notification:", e);
    }
  } else {
    console.warn("Notification permission not granted");
  }
};
