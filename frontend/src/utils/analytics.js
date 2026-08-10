export const trackFrontendEvent = (name, properties) => {
  if (window.Analytics) {
    window.Analytics.track(name, properties);
  } else {
    console.warn('Analytics not loaded');
  }
};