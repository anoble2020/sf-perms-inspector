// Content script for Salesforce Field Permissions Inspector
class SalesforceFieldInspector {
    constructor() {
      this.sessionId = null;
      this.serverUrl = null;
      this.apiVersion = '58.0';
      this.init();
    }
  
    init() {
      // Wait for Salesforce to load
      if (this.isSalesforce()) {
        this.extractSessionInfo();
        this.observeDOM();
      }
    }
  
    isSalesforce() {
      return window.location.hostname.includes('salesforce.com') || 
             window.location.hostname.includes('force.com');
    }
  
    extractSessionInfo() {
      // Extract session ID from page - try multiple methods
      const scripts = document.getElementsByTagName('script');
      
      // Method 1: Look for sid in scripts
      for (let script of scripts) {
        if (script.innerHTML.includes('sid')) {
          const match = script.innerHTML.match(/"sid":"([^"]+)"/);
          if (match) {
            this.sessionId = match[1];
            break;
          }
        }
      }
      
      // Method 2: Try to get from window.__sfdcSessionId if available
      if (!this.sessionId && window.__sfdcSessionId) {
        this.sessionId = window.__sfdcSessionId;
      }
      
      // Method 3: Try to get from cookies
      if (!this.sessionId) {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
          if (cookie.trim().startsWith('sid=')) {
            this.sessionId = cookie.trim().substring(4);
            break;
          }
        }
      }
      
      // Set server URL
      this.serverUrl = `https://${window.location.hostname}`;
      
      console.log('Session ID found:', this.sessionId ? 'Yes' : 'No');
    }
  
    observeDOM() {
      // Create observer to watch for field additions
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                this.processFieldElements(node);
              }
            });
          }
        });
      });
  
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
  
      // Process existing fields
      this.processFieldElements(document.body);
    }
  
    processFieldElements(container) {
      // Look for flexipage-field elements and other SLDS field elements
      const fieldSelectors = [
        'flexipage-field[data-field-id]',
        '.slds-form-element__label',
        'lightning-input',
        'lightning-textarea',
        'lightning-combobox',
        'lightning-dual-listbox',
        'div[data-target-selection-name]'
      ];
  
      fieldSelectors.forEach(selector => {
        const elements = container.querySelectorAll(selector);
        elements.forEach(element => this.addInfoIcon(element));
      });
    }
  
    addInfoIcon(fieldElement) {
      console.log('Adding info icon for element:', fieldElement);
      // Skip if already processed
      if (fieldElement.querySelector('.field-permissions-icon')) {
        return;
      }
  
      const fieldInfo = this.extractFieldInfo(fieldElement);
      console.log('Field info extracted:', fieldInfo); // Debug logging
      // Log the field API name for debugging
      console.log('Extracted fieldName:', fieldInfo.fieldName, 'objectName:', fieldInfo.objectName);
      
      // Exclude standard fields with always-granted permissions
      const excludedFields = [
        'Name', 'CreatedById', 'CreatedDate', 'LastModifiedById', 'LastModifiedDate', 'OwnerId'
      ];
      if (!fieldInfo.fieldName || !fieldInfo.objectName || excludedFields.includes(fieldInfo.fieldName)) {
        return;
      }
  
      const icon = this.createInfoIcon(fieldInfo);
      this.insertIcon(fieldElement, icon);
      console.log('Icon added for:', fieldInfo.fieldName); // Debug logging
    }
  
    extractFieldInfo(element) {
        console.log('Extracting field info for element:', element);
      let fieldName = '';
      let objectName = '';
  
      // New: Handle data-target-selection-name attribute
      if (element.hasAttribute && element.hasAttribute('data-target-selection-name')) {
        const target = element.getAttribute('data-target-selection-name');
        console.log('Data-target-selection-name value:', target);
        // Example: sfdc:RecordField.WorkPlan.Name
        const match = target.match(/sfdc:RecordField\.(\w+)\.(\w+)/);
        if (match) {
          objectName = match[1];
          fieldName = match[2];
          console.log('Extracted from data-target-selection-name:', { objectName, fieldName });
          return { fieldName, objectName };
        }
      }
  
      // Handle flexipage-field elements
      if (element.tagName === 'FLEXIPAGE-FIELD') {
        const dataFieldId = element.getAttribute('data-field-id');
        console.log('Data-field-id value:', dataFieldId);
        if (dataFieldId) {
          // Extract field name from data-field-id (e.g., "RecordWorkOrderNumberField" -> "WorkOrderNumber")
          const match = dataFieldId.match(/Record(.+)Field$/);
          if (match) {
            fieldName = match[1];
            console.log('Extracted fieldName:', fieldName);
          }
        }
      } else {
        // Try to extract field API name from various attributes
        const possibleAttributes = ['data-field-name', 'field-name', 'name'];
        for (let attr of possibleAttributes) {
          if (element.hasAttribute(attr)) {
            fieldName = element.getAttribute(attr);
            break;
          }
        }
  
        // Try to extract from parent elements
        if (!fieldName) {
          const parent = element.closest('[data-field-name], [field-name], flexipage-field[data-field-id]');
          if (parent) {
            if (parent.tagName === 'FLEXIPAGE-FIELD') {
              const dataFieldId = parent.getAttribute('data-field-id');
              const match = dataFieldId.match(/Record(.+)Field$/);
              if (match) {
                fieldName = match[1];
              }
            } else {
              fieldName = parent.getAttribute('data-field-name') || parent.getAttribute('field-name');
            }
          }
        }
      }
  
      // Extract object name from URL patterns
      const urlPatterns = [
        /\/lightning\/r\/(\w+)\//, // /lightning/r/WorkOrder/003xx0000004C6Q
        /\/(\w+)\/view/, // /WorkOrder/view
        /\/one\/one\.app#\/sObject\/(\w+)\/view/ // classic URL pattern
      ];
  
      for (let pattern of urlPatterns) {
        const match = window.location.pathname.match(pattern) || window.location.href.match(pattern);
        if (match) {
          objectName = match[1];
          break;
        }
      }
  
      // Try to get object name from page title or other sources
      if (!objectName) {
        const pageTitle = document.title;
        const match = pageTitle.match(/(\w+)\s*\|/);
        if (match) {
          objectName = match[1];
        }
      }
  
      return { fieldName, objectName };
    }
  
    createInfoIcon(fieldInfo) {
      const icon = document.createElement('span');
      icon.className = 'field-permissions-icon';
      // Use shield.png as the icon
      const img = document.createElement('img');
      img.src = chrome.runtime.getURL('icons/shield128.png');
      img.alt = 'Field Permissions';
      img.style.width = '16px';
      img.style.height = '16px';
      img.style.verticalAlign = 'middle';
      img.style.marginLeft = '4px';
      icon.appendChild(img);
      icon.style.cursor = 'pointer';
      icon.title = 'View field permissions';

      // Spinner element
      const spinner = document.createElement('span');
      spinner.className = 'field-permissions-spinner';
      spinner.style.display = 'none';
      spinner.style.width = '16px';
      spinner.style.height = '16px';
      spinner.style.marginLeft = '4px';
      spinner.style.verticalAlign = 'middle';
      spinner.innerHTML = `<svg width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#0176d3" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(72.3246 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>`;
      icon.appendChild(spinner);

      icon.addEventListener('click', async (e) => {
        e.stopPropagation();
        // Show spinner, hide icon
        img.style.display = 'none';
        spinner.style.display = '';
        try {
          await this.showPermissionsModal(fieldInfo);
        } finally {
          // Hide spinner, show icon
          spinner.style.display = 'none';
          img.style.display = '';
        }
      });

      return icon;
    }
  
    insertIcon(fieldElement, icon) {
      // Handle flexipage-field elements
      if (fieldElement.tagName === 'FLEXIPAGE-FIELD') {
        const labelElement = fieldElement.querySelector('.test-id__field-label');
        if (labelElement) {
          labelElement.appendChild(icon);
          return;
        }
      }

      // Special handling for checkboxes
      const checkboxInput = fieldElement.querySelector('input[type="checkbox"]');
      if (checkboxInput) {
        // Try to find the visible label span for the checkbox
        // Look for the closest .slds-checkbox__label or .slds-form-element__label
        let labelSpan = checkboxInput.closest('label.slds-checkbox__label') || fieldElement.querySelector('.slds-form-element__label');
        if (labelSpan) {
          labelSpan.appendChild(icon);
          return;
        }
      }

      // Find the best place to insert the icon for other elements
      const label = fieldElement.querySelector('label') || 
                   fieldElement.querySelector('.test-id__field-label') ||
                   fieldElement.closest('.slds-form-element')?.querySelector('label') ||
                   fieldElement.closest('.slds-form-element')?.querySelector('.test-id__field-label');
      
      if (label) {
        label.appendChild(icon);
      } else {
        fieldElement.appendChild(icon);
      }
    }
  
    async showPermissionsModal(fieldInfo) {
      try {
        const permissions = await this.fetchFieldPermissions(fieldInfo);
        this.createModal(fieldInfo, permissions);
      } catch (error) {
        console.error('Error fetching permissions:', error);
        this.showError('Failed to fetch field permissions');
      }
    }
  
    async fetchFieldPermissions(fieldInfo) {
      const query = `
        SELECT Id, Field, PermissionsEdit, PermissionsRead, 
               Parent.Name, Parent.Type, Parent.Profile.Name
        FROM FieldPermissions 
        WHERE Field = '${fieldInfo.objectName}.${fieldInfo.fieldName}'
        ORDER BY Parent.Type, Parent.Name
      `;
      console.log('Query:', query);
      // Get the Salesforce my.salesforce.com domain from the current Lightning domain
      const lightningDomain = window.location.hostname;
      const myDomain = lightningDomain.replace('.lightning.force.com', '.my.salesforce.com');
      const apiUrl = `https://${myDomain}/services/data/v${this.apiVersion}/query/?q=${encodeURIComponent(query)}`;
      // Request sessionId from background script
      const sessionId = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getSessionId', domain: myDomain }, (response) => {
          if (response && response.sessionId) {
            resolve(response.sessionId);
          } else {
            reject(response && response.error ? response.error : 'Failed to get sessionId');
          }
        });
      });
      // Use XMLHttpRequest to make the API call
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', apiUrl, true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
        xhr.setRequestHeader('Accept', 'application/json; charset=UTF-8');
        xhr.onreadystatechange = function () {
          if (xhr.readyState === 4) {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error('API request failed: ' + xhr.status));
            }
          }
        };
        xhr.send();
      });
      console.log('Raw field permissions query result:', data);
      return this.processPermissions(data.records);
    }
  
    processPermissions(records) {
      const permissions = {
        profiles: [],
        permissionSets: []
      };
      const seenProfiles = new Set();
      const seenPermSets = new Set();

      records.forEach(record => {
        let item = {
          name: '',
          read: record.PermissionsRead,
          edit: record.PermissionsEdit,
          profileName: undefined
        };
        if (record.Parent.Type === 'Profile') {
          const uniqueKey = record.Parent.Profile && record.Parent.Profile.Name ? record.Parent.Profile.Name : record.Parent.Name;
          if (!seenProfiles.has(uniqueKey)) {
            item.name = uniqueKey;
            item.profileName = item.name;
            permissions.profiles.push(item);
            seenProfiles.add(uniqueKey);
          }
        } else {
          const uniqueKey = record.Parent.Name;
          if (!seenPermSets.has(uniqueKey)) {
            item.name = uniqueKey;
            permissions.permissionSets.push(item);
            seenPermSets.add(uniqueKey);
          }
        }
      });

      return permissions;
    }
  
    createModal(fieldInfo, permissions) {
      // Remove existing modal if present
      const existingModal = document.getElementById('field-permissions-modal');
      if (existingModal) {
        existingModal.remove();
      }
  
      const modal = document.createElement('div');
      modal.id = 'field-permissions-modal';
      modal.className = 'slds-modal slds-fade-in-open';
      modal.style.zIndex = '2147483647'; // Ensure modal is on top
      modal.innerHTML = `
        <div class="slds-modal__container" style="z-index:2147483647;">
          <header class="slds-modal__header">
            <h2 class="slds-text-heading_medium">Field Permissions</h2>
            <button id="field-permissions-modal-close" class="slds-button slds-button_icon slds-modal__close" style="z-index:2147483647;">
              <span class="slds-button__icon">×</span>
            </button>
          </header>
          <div class="slds-modal__content slds-p-around_medium">
            <div class="field-info">
              <h3 class="slds-text-heading_small">Field: ${fieldInfo.objectName}.${fieldInfo.fieldName}</h3>
            </div>
            
            <div class="slds-tabs_default">
              <ul class="slds-tabs_default__nav" role="tablist">
                <li class="slds-tabs_default__item slds-is-active" role="presentation">
                  <a class="slds-tabs_default__link" href="#profiles-tab" role="tab">Profiles</a>
                </li>
                <li class="slds-tabs_default__item" role="presentation">
                  <a class="slds-tabs_default__link" href="#permsets-tab" role="tab">Permission Sets</a>
                </li>
              </ul>
              
              <div id="profiles-tab" class="slds-tabs_default__content slds-show" role="tabpanel">
                ${this.createPermissionsTable(permissions.profiles)}
              </div>
              
              <div id="permsets-tab" class="slds-tabs_default__content slds-hide" role="tabpanel">
                ${this.createPermissionsTable(permissions.permissionSets)}
              </div>
            </div>
          </div>
        </div>
        <div class="slds-backdrop slds-backdrop_open" style="z-index:2147483646;"></div>
      `;
  
      document.body.appendChild(modal);
      // Add event listener for close button
      const closeBtn = modal.querySelector('#field-permissions-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.remove();
        });
      }
      this.setupModalTabs(modal);
    }
  
    createPermissionsTable(permissions) {
      if (permissions.length === 0) {
        return '<p class="slds-text-color_weak">No permissions found</p>';
      }
  
      let tableHtml = `
        <table class="slds-table slds-table_bordered slds-table_cell-buffer">
          <thead>
            <tr class="slds-line-height_reset">
              <th scope="col"><span class="slds-truncate">Name</span></th>
              <th scope="col"><span class="slds-truncate">Read</span></th>
              <th scope="col"><span class="slds-truncate">Edit</span></th>
            </tr>
          </thead>
          <tbody>
      `;
  
      permissions.forEach(perm => {
        tableHtml += `
          <tr>
            <td><span class="slds-truncate">${perm.name}</span></td>
            <td><span class="slds-icon_container slds-icon-utility-${perm.read ? 'success' : 'error'} slds-current-color">
              ${perm.read ? '✓' : '✗'}
            </span></td>
            <td><span class="slds-icon_container slds-icon-utility-${perm.edit ? 'success' : 'error'} slds-current-color">
              ${perm.edit ? '✓' : '✗'}
            </span></td>
          </tr>
        `;
      });
  
      tableHtml += '</tbody></table>';
      return tableHtml;
    }
  
    setupModalTabs(modal) {
      const tabs = modal.querySelectorAll('.slds-tabs_default__link');
      const tabContents = modal.querySelectorAll('.slds-tabs_default__content');
  
      tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          
          // Remove active classes
          tabs.forEach(t => t.parentElement.classList.remove('slds-is-active'));
          tabContents.forEach(tc => tc.classList.add('slds-hide'));
          
          // Add active class to clicked tab
          tab.parentElement.classList.add('slds-is-active');
          
          // Show corresponding content
          const targetId = tab.getAttribute('href').substring(1);
          document.getElementById(targetId).classList.remove('slds-hide');
        });
      });
    }
  
    showError(message) {
      const toast = document.createElement('div');
      toast.className = 'slds-notify slds-notify_toast slds-theme_error';
      toast.innerHTML = `
        <span class="slds-assistive-text">Error</span>
        <div class="slds-notify__content">
          <h2 class="slds-text-heading_small">${message}</h2>
        </div>
      `;
      
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 5000);
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SalesforceFieldInspector());
  } else {
    new SalesforceFieldInspector();
  }