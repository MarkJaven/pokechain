/* Transaction Modal Manager */

class TransactionModal {
  constructor() {
    this.currentModal = null;
  }

  create(config) {
    // Remove existing modal if any
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const content = document.createElement('div');
    content.className = 'modal-content';

    // Close button (only for non-loading states)
    if (config.closable !== false) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'modal-close';
      closeBtn.innerHTML = '×';
      closeBtn.onclick = () => this.close();
      content.appendChild(closeBtn);
    }

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const icon = document.createElement('div');
    icon.className = `modal-icon ${config.type || 'loading'}`;
    icon.innerHTML = this.getIcon(config.type);
    header.appendChild(icon);

    const titleContainer = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'modal-title';
    title.textContent = config.title;
    titleContainer.appendChild(title);
    header.appendChild(titleContainer);

    content.appendChild(header);

    // Body
    if (config.body) {
      const body = document.createElement('div');
      body.className = 'modal-body';
      
      if (typeof config.body === 'string') {
        body.innerHTML = config.body;
      } else {
        body.appendChild(config.body);
      }
      
      content.appendChild(body);
    }

    // Details section
    if (config.details) {
      const details = document.createElement('div');
      details.className = 'modal-details';
      
      config.details.forEach(detail => {
        const row = document.createElement('div');
        row.className = 'modal-detail-row';
        
        const label = document.createElement('span');
        label.className = 'modal-detail-label';
        label.textContent = detail.label;
        
        const value = document.createElement('span');
        value.className = `modal-detail-value ${detail.highlight ? 'highlight' : ''}`;
        value.textContent = detail.value;
        
        row.appendChild(label);
        row.appendChild(value);
        details.appendChild(row);
      });
      
      content.appendChild(details);
    }

    // Actions
    if (config.actions && config.actions.length > 0) {
      const actions = document.createElement('div');
      actions.className = 'modal-actions';
      
      config.actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = `modal-btn modal-btn-${action.type || 'secondary'}`;
        btn.textContent = action.text;
        btn.disabled = action.disabled || false;
        btn.onclick = () => {
          if (action.onClick) action.onClick();
        };
        actions.appendChild(btn);
      });
      
      content.appendChild(actions);
    }

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    this.currentModal = overlay;

    // Close on outside click (only if closable)
    if (config.closable !== false) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    return overlay;
  }

  getIcon(type) {
    const icons = {
      loading: '⏳',
      success: '✓',
      error: '✕',
      confirm: '⚠',
      info: 'ℹ'
    };
    return icons[type] || icons.loading;
  }

  close() {
    if (this.currentModal) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  }

  // Pre-built modals
  loading(title, message) {
    return this.create({
      type: 'loading',
      title: title || 'Processing...',
      body: message || 'Please wait while we process your transaction.',
      closable: false
    });
  }

  success(title, message, onClose) {
    return this.create({
      type: 'success',
      title: title || 'Success!',
      body: message,
      actions: [{
        text: 'Close',
        type: 'primary',
        onClick: () => {
          this.close();
          if (onClose) onClose();
        }
      }]
    });
  }

  error(title, message) {
    return this.create({
      type: 'error',
      title: title || 'Error',
      body: message || 'Something went wrong. Please try again.',
      actions: [{
        text: 'Close',
        type: 'secondary',
        onClick: () => this.close()
      }]
    });
  }

  confirm(config) {
    return new Promise((resolve) => {
      this.create({
        type: 'confirm',
        title: config.title,
        body: config.message,
        details: config.details,
        actions: [
          {
            text: config.cancelText || 'Cancel',
            type: 'secondary',
            onClick: () => {
              this.close();
              resolve(false);
            }
          },
          {
            text: config.confirmText || 'Confirm',
            type: config.dangerous ? 'danger' : 'primary',
            onClick: () => {
              this.close();
              resolve(true);
            }
          }
        ]
      });
    });
  }

  async prompt(config) {
    return new Promise((resolve) => {
      let inputValue = config.defaultValue || '';
      
      const inputGroup = document.createElement('div');
      inputGroup.className = 'modal-input-group';
      
      if (config.label) {
        const label = document.createElement('label');
        label.className = 'modal-input-label';
        label.textContent = config.label;
        inputGroup.appendChild(label);
      }
      
      const input = document.createElement('input');
      input.className = 'modal-input';
      input.type = config.inputType || 'text';
      input.placeholder = config.placeholder || '';
      input.value = inputValue;
      input.addEventListener('input', (e) => {
        inputValue = e.target.value;
      });
      
      inputGroup.appendChild(input);
      
      const body = document.createElement('div');
      if (config.message) {
        const msg = document.createElement('p');
        msg.textContent = config.message;
        body.appendChild(msg);
      }
      body.appendChild(inputGroup);
      
      this.create({
        type: config.type || 'info',
        title: config.title,
        body: body,
        actions: [
          {
            text: 'Cancel',
            type: 'secondary',
            onClick: () => {
              this.close();
              resolve(null);
            }
          },
          {
            text: config.confirmText || 'Submit',
            type: 'primary',
            onClick: () => {
              if (config.validate && !config.validate(inputValue)) {
                return;
              }
              this.close();
              resolve(inputValue);
            }
          }
        ]
      });
      
      // Focus input
      setTimeout(() => input.focus(), 100);
    });
  }

  transaction(config) {
    const progressBody = document.createElement('div');
    progressBody.innerHTML = `
      <p>${config.message || 'Transaction is being processed...'}</p>
      <div class="modal-progress">
        <div class="modal-progress-bar">
          <div class="modal-progress-fill"></div>
        </div>
      </div>
      <p style="font-size: 0.85rem; color: rgba(255,255,255,0.6); margin-top: 15px;">
        ${config.subtitle || 'Please confirm the transaction in your wallet.'}
      </p>
    `;

    return this.create({
      type: 'loading',
      title: config.title || 'Processing Transaction',
      body: progressBody,
      closable: false
    });
  }
}

// Create global instance
window.txModal = new TransactionModal();