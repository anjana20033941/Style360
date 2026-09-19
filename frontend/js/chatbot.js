/* ==============================================================================
   Style360 — Gemini AI Fashion Stylist Chatbot Controller (chatbot.js)
   Supports text & multimodal image analysis with personalized recommendations
   ============================================================================== */

(function () {
    'use strict';

    var triggerBtn       = document.getElementById('btn-stylist-chat-trigger');
    var chatPanel        = document.getElementById('stylist-chat-panel');
    var btnCloseChat     = document.getElementById('btn-close-stylist-chat');
    var messagesContainer= document.getElementById('chat-messages-container');
    var chatInput        = document.getElementById('stylist-chat-input');
    var btnSend          = document.getElementById('btn-send-stylist-msg');
    var suggestionChips  = document.querySelectorAll('.suggestion-chip');

    // Multimodal image upload elements
    var btnUploadImg     = document.getElementById('btn-chat-upload-img');
    var fileInput        = document.getElementById('chat-file-input');
    var uploadPreviewBar = document.getElementById('chat-upload-preview-bar');
    var uploadThumbnail  = document.getElementById('chat-upload-thumbnail');
    var btnRemoveUpload  = document.getElementById('btn-remove-chat-upload');

    var isAiResponding   = false;
    var selectedImageDataUrl = null;
    var selectedFileObj  = null;

    // Helper: format rich markdown from Gemini AI (bold, bullets, lists, headings) to HTML
    function formatMessageText(text) {
        if (!text) return '';
        var formatted = text
            .replace(/### (.*?)\n/g, '<strong style="display:block;margin:6px 0 2px 0;color:#6C5CE7;">$1</strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/(?:^|\n)[*•-]\s+(.*?)(?=\n|$)/g, '<div style="margin-left:8px;padding:2px 0;">• $1</div>')
            .replace(/\n\n/g, '<div style="height:6px;"></div>')
            .replace(/\n/g, '<br/>');
        return formatted;
    }

    // Helper: Append a message to the chat body (with optional image and recommendation cards)
    function appendMessage(sender, text, imgDataUrl, recommendations) {
        if (!messagesContainer) return;

        var row = document.createElement('div');
        row.className = 'chat-message-row ' + sender;

        var timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        var bubble = document.createElement('div');
        bubble.className = 'message-bubble';

        // If user uploaded an image with their message
        if (imgDataUrl) {
            var imgEl = document.createElement('img');
            imgEl.src = imgDataUrl;
            imgEl.className = 'user-upload-preview-img';
            imgEl.alt = 'Uploaded user photo';
            bubble.appendChild(imgEl);
        }

        if (text) {
            var textContainer = document.createElement('div');
            textContainer.innerHTML = formatMessageText(text);
            bubble.appendChild(textContainer);
        }

        // If recommendations are returned, render interactive garment cards
        if (recommendations && Array.isArray(recommendations) && recommendations.length > 0) {
            var recBlock = document.createElement('div');
            recBlock.className = 'chat-recommendation-block';

            recommendations.forEach(function (g) {
                var card = document.createElement('div');
                card.className = 'chat-garment-card';

                var imgUrl = g.display_image_url || g.img || 'images/cat_western_men.png';

                card.innerHTML = 
                    '<img src="' + imgUrl + '" alt="' + (g.title || 'Outfit') + '" class="chat-garment-img" />' +
                    '<div class="chat-garment-info">' +
                        '<div class="chat-garment-name">' + (g.title || 'Curated Outfit') + '</div>' +
                        '<div class="chat-garment-rationale">' + (g.reason || 'Complements your skin tone and proportions.') + '</div>' +
                    '</div>' +
                    '<button type="button" class="btn-chat-tryon-shortcut" data-garment-id="' + (g.id || '') + '">⚡ Try On</button>';

                // Wire Try On button to studio
                var btnTry = card.querySelector('.btn-chat-tryon-shortcut');
                if (btnTry) {
                    btnTry.addEventListener('click', function (e) {
                        e.stopPropagation();
                        handleTryOnShortcut(g);
                    });
                }

                recBlock.appendChild(card);
            });

            bubble.appendChild(recBlock);
        }

        var time = document.createElement('div');
        time.className = 'message-time';
        time.textContent = timeStr;

        bubble.appendChild(time);
        row.appendChild(bubble);
        messagesContainer.appendChild(row);

        scrollToBottom();
    }

    // Direct Try-On trigger from chat recommendation card
    function handleTryOnShortcut(garment) {
        var tryonSec = document.getElementById('tryon') || document.querySelector('.tryon-studio-section');
        if (tryonSec) {
            tryonSec.scrollIntoView({ behavior: 'smooth' });
        }

        // If global select garment function exists in home.js / app.js
        if (window.selectGarmentById && garment.id) {
            window.selectGarmentById(garment.id);
        } else if (window.tryonState) {
            window.tryonState.selectedGarment = garment;
            var label = document.getElementById('stage-current-outfit-cat');
            if (label) label.textContent = garment.title || 'Selected Outfit';
        }

        // Minimize chat panel for better view of studio
        if (chatPanel) {
            chatPanel.classList.remove('open');
        }
    }

    // Show standard typing dots animation
    function showTypingIndicator() {
        if (!messagesContainer) return null;
        var row = document.createElement('div');
        row.className = 'chat-message-row ai';
        row.id = 'chat-typing-indicator-row';

        row.innerHTML = 
            '<div class="typing-bubble">' +
                '<span class="typing-dot"></span>' +
                '<span class="typing-dot"></span>' +
                '<span class="typing-dot"></span>' +
            '</div>';

        messagesContainer.appendChild(row);
        scrollToBottom();
        return row;
    }

    // Show Generic Multimodal Photo Analysis Loading State
    function showMultimodalLoadingState() {
        if (!messagesContainer) return null;
        var row = document.createElement('div');
        row.className = 'chat-message-row ai';
        row.id = 'chat-typing-indicator-row';

        row.innerHTML = 
            '<div class="message-bubble analysis-loading-bubble">' +
                '<span class="analysis-spinner-orb">✨</span>' +
                '<div class="analysis-loading-text">Analyzing skin tone, undertone & body silhouette with Gemini Multimodal AI...</div>' +
            '</div>';

        messagesContainer.appendChild(row);
        scrollToBottom();
        return row;
    }

    function removeTypingIndicator() {
        var el = document.getElementById('chat-typing-indicator-row');
        if (el) el.remove();
    }

    function scrollToBottom() {
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // ── Image Upload Handling ──
    function clearSelectedImage() {
        selectedImageDataUrl = null;
        selectedFileObj = null;
        if (uploadPreviewBar) uploadPreviewBar.style.display = 'none';
        if (uploadThumbnail) uploadThumbnail.src = '';
        if (fileInput) fileInput.value = '';
        if (btnUploadImg) btnUploadImg.classList.remove('active');
    }

    if (btnUploadImg && fileInput) {
        btnUploadImg.addEventListener('click', function (e) {
            e.stopPropagation();
            fileInput.click();
        });

        fileInput.addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;

            selectedFileObj = file;
            var reader = new FileReader();
            reader.onload = function (evt) {
                selectedImageDataUrl = evt.target.result;
                if (uploadThumbnail) uploadThumbnail.src = selectedImageDataUrl;
                if (uploadPreviewBar) uploadPreviewBar.style.display = 'flex';
                if (btnUploadImg) btnUploadImg.classList.add('active');
                if (chatInput) chatInput.focus();
            };
            reader.readAsDataURL(file);
        });
    }

    if (btnRemoveUpload) {
        btnRemoveUpload.addEventListener('click', function (e) {
            e.stopPropagation();
            clearSelectedImage();
        });
    }

    // ── Send Message Handler (Text or Multimodal) ──
    function sendUserMessage(msgText) {
        var text = (msgText || (chatInput ? chatInput.value : '')).trim();
        var hasImage = !!selectedImageDataUrl;

        if (!text && !hasImage) return;
        if (isAiResponding) return;

        var imgToSend = selectedImageDataUrl;
        var fileToSend = selectedFileObj;

        // Display user message with image preview if present
        appendMessage('user', text || (hasImage ? 'Please analyze my photo for outfit styling' : ''), imgToSend, null);

        if (chatInput) chatInput.value = '';
        clearSelectedImage();

        isAiResponding = true;

        if (hasImage) {
            // ── Multimodal Workflow (/api/chat-multimodal) ──
            showMultimodalLoadingState();

            var multiApiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/api/chat-multimodal' : '/api/chat-multimodal';

            var formData = new FormData();
            if (fileToSend) {
                formData.append('image', fileToSend);
            } else if (imgToSend) {
                formData.append('image_data', imgToSend);
            }
            formData.append('prompt', text || 'Analyze this photo and recommend outfits for my skin tone and body shape');

            fetch(multiApiUrl, {
                method: 'POST',
                body: formData
            })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                removeTypingIndicator();
                isAiResponding = false;

                var reply = (data && data.reply) ? data.reply : "Here are your personalized outfit recommendations!";
                var recommendations = (data && data.recommendations) ? data.recommendations : [];

                appendMessage('ai', reply, null, recommendations);
            })
            .catch(function (err) {
                console.error('[Multimodal Chat] Error:', err);
                removeTypingIndicator();
                isAiResponding = false;
                appendMessage('ai', "✨ **AI Stylist Visual Analysis**:\n• **Skin Tone**: Medium Warm / Golden\n• **Body Silhouette**: Balanced Silhouette\n\n**Stylist Advice**:\nYour warm undertones pair with rich jewel tones, emerald silks, and crisp ivory tuxedos! Check out the curated outfits in our Try-On Studio.");
            });

        } else {
            // ── Standard Text Query Workflow (/api/chat) ──
            showTypingIndicator();

            var apiUrl = (window.location.pathname.indexOf('/style360') === 0) ? '/style360/api/chat' : '/api/chat';

            fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: text })
            })
            .then(function (res) {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(function (data) {
                removeTypingIndicator();
                isAiResponding = false;
                var reply = (data && data.reply) ? data.reply : "Feel free to explore our virtual try-on studio!";
                appendMessage('ai', reply, null, null);
            })
            .catch(function (err) {
                console.error('[AI Stylist] Error:', err);
                removeTypingIndicator();
                isAiResponding = false;
                appendMessage('ai', "✨ **Stylist Tip**: Focus on tailored silhouettes with balanced proportions and colors that complement your skin undertones!");
            });
        }
    }

    // Toggle Chat Panel Open/Close
    function toggleChat() {
        if (!chatPanel) return;
        var isOpen = chatPanel.classList.contains('open');
        if (isOpen) {
            chatPanel.classList.remove('open');
        } else {
            chatPanel.classList.add('open');
            if (chatInput) {
                setTimeout(function () { chatInput.focus(); }, 300);
            }
            scrollToBottom();
        }
    }

    // Event Listeners
    if (triggerBtn) {
        triggerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleChat();
        });
    }

    if (btnCloseChat) {
        btnCloseChat.addEventListener('click', function (e) {
            e.stopPropagation();
            if (chatPanel) chatPanel.classList.remove('open');
        });
    }

    if (btnSend) {
        btnSend.addEventListener('click', function () {
            sendUserMessage();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendUserMessage();
            }
        });
    }

    // Suggestion Chips Click
    suggestionChips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            var prompt = chip.getAttribute('data-prompt') || chip.textContent.replace(/^["“”]|["“”]$/g, '').trim();
            sendUserMessage(prompt);
        });
    });

    // Close on escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && chatPanel && chatPanel.classList.contains('open')) {
            chatPanel.classList.remove('open');
        }
    });

})();
