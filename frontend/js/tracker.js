/**
 * Style360
 * Contributor: Member 3 (Frontend 3D Showcase & Gallery Contributor)
 */
/**
 * Style360 — Interactive Custom Request Progress Tracker (frontend/js/tracker.js)
 * Generates horizontal stage progression components with active status indicators.
 */

(function (window) {
    'use strict';

    /**
     * Renders a 3-stage horizontal tracker HTML string
     * @param {string} status - 'Pending Review' | 'In Design' | 'Ready for Download'
     * @returns {string} HTML markup for horizontal tracker
     */
    function renderTracker(status) {
        var norm = (status || 'Pending Review').trim().toLowerCase();

        var isStep1Done = (norm === 'in design' || norm === 'ready for download' || norm === 'completed');
        var isStep1Active = (norm === 'pending review' || norm === 'pending');

        var isStep2Done = (norm === 'ready for download' || norm === 'completed');
        var isStep2Active = (norm === 'in design');

        var isStep3Done = (norm === 'ready for download' || norm === 'completed');

        var fillWidth = '0%';
        if (norm === 'in design') fillWidth = '50%';
        else if (isStep3Done) fillWidth = '100%';

        return (
            '<div class="tracker-container">' +
                '<div class="tracker-title">Request Progress Tracker</div>' +
                '<div class="tracker-steps tracker-steps-wrap">' +
                    '<div class="tracker-line-track">' +
                        '<div class="tracker-line-fill" style="width:' + fillWidth + ';"></div>' +
                    '</div>' +
                    '<div class="tracker-step ' + (isStep1Done ? 'completed' : (isStep1Active ? 'active' : '')) + '">' +
                        '<div class="step-circle">' + (isStep1Done ? '✓' : '1') + '</div>' +
                        '<div class="step-label">Pending Review</div>' +
                        '<div class="step-desc">Request Received</div>' +
                    '</div>' +
                    '<div class="tracker-step ' + (isStep2Done ? 'completed' : (isStep2Active ? 'active' : '')) + '">' +
                        '<div class="step-circle">' + (isStep2Done ? '✓' : (isStep2Active ? '🎨' : '2')) + '</div>' +
                        '<div class="step-label">In Design</div>' +
                        '<div class="step-desc">Tailoring &amp; Color Match</div>' +
                    '</div>' +
                    '<div class="tracker-step ' + (isStep3Done ? 'completed' : '') + '">' +
                        '<div class="step-circle">' + (isStep3Done ? '🎉' : '3') + '</div>' +
                        '<div class="step-label">Ready</div>' +
                        '<div class="step-desc">Finished Garment</div>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );
    }

    window.Style360Tracker = {
        renderTracker: renderTracker
    };

})(window);
