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
      // Skip if already processed on this element or any ancestor up to flexipage-field
      if (fieldElement.querySelector('.field-permissions-icon')) {
        return;
      }
      let ancestor = fieldElement.parentElement;
      while (ancestor && ancestor.tagName !== 'FLEXIPAGE-FIELD') {
        if (ancestor.querySelector && ancestor.querySelector('.field-permissions-icon')) {
          return;
        }
        ancestor = ancestor.parentElement;
      }
  
      const fieldInfo = this.extractFieldInfo(fieldElement);
      console.log('Field info extracted:', fieldInfo); // Debug logging
      
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
            // Fix: if fieldName ends with '_c', replace with '__c'
            if (fieldName.endsWith('_c')) {
              fieldName = fieldName.replace(/_c$/, '__c');
            }
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
        // Query all permission sets
        const lightningDomain = window.location.hostname;
        const myDomain = lightningDomain.replace('.lightning.force.com', '.my.salesforce.com');
        const sessionId = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'getSessionId', domain: myDomain }, (response) => {
            if (response && response.sessionId) {
              resolve(response.sessionId);
            } else {
              reject(response && response.error ? response.error : 'Failed to get sessionId');
            }
          });
        });
        const permSetQuery = `SELECT Id, Name FROM PermissionSet WHERE IsOwnedByProfile = false`;
        const permSetUrl = `https://${myDomain}/services/data/v${this.apiVersion}/query/?q=${encodeURIComponent(permSetQuery)}`;
        const permSetResp = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', permSetUrl, true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
          xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error('Failed to query PermissionSets: ' + xhr.status + ' ' + xhr.responseText));
              }
            }
          };
          xhr.send();
        });
        const allPermSets = permSetResp.records || [];
        // Query users for lookup
        const userQuery = `SELECT Id, Name, Username FROM User WHERE IsActive = true ORDER BY Name LIMIT 50`;
        const userUrl = `https://${myDomain}/services/data/v${this.apiVersion}/query/?q=${encodeURIComponent(userQuery)}`;
        const userResp = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', userUrl, true);
          xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
          xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                reject(new Error('Failed to query Users: ' + xhr.status + ' ' + xhr.responseText));
              }
            }
          };
          xhr.send();
        });
        const allUsers = userResp.records || [];
        // Query field permissions as before
        const permissions = await this.fetchFieldPermissions(fieldInfo);
        // Store the last raw records for use in POST logic
        if (this.lastFieldPermissionsRecords === undefined) {
          this.lastFieldPermissionsRecords = [];
        }
        if (permissions && permissions._rawRecords) {
          this.lastFieldPermissionsRecords = permissions._rawRecords;
        } else if (permissions && permissions.rawRecords) {
          this.lastFieldPermissionsRecords = permissions.rawRecords;
        } else if (permissions && permissions.records) {
          this.lastFieldPermissionsRecords = permissions.records;
        }
        // Merge all permission sets with field permissions
        if (permissions && permissions.permissionSets) {
          const permSetMap = {};
          permissions.permissionSets.forEach(ps => {
            if (ps && ps.parentId) permSetMap[ps.parentId] = ps;
          });
          // Add missing permission sets as unchecked
          allPermSets.forEach(ps => {
            if (!permSetMap[ps.Id]) {
              permissions.permissionSets.push({
                name: ps.Name,
                read: false,
                edit: false,
                id: null,
                parentId: ps.Id
              });
            }
          });
          // Sort after merge
          permissions.permissionSets.sort((a, b) => a.name.localeCompare(b.name));
        }
        permissions._allUsers = allUsers;
        console.log('[FieldPerm POST] lastFieldPermissionsRecords set:', this.lastFieldPermissionsRecords);
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
      // Save the raw records for POST logic
      this.lastFieldPermissionsRecords = records;
      const permissions = {
        profiles: [],
        permissionSets: []
      };
      const seenProfiles = new Set();
      const seenPermSets = new Set();

      records.forEach(record => {
        console.log('FieldPermissions record:', record);
        let item = {
          name: '',
          read: record.PermissionsRead,
          edit: record.PermissionsEdit,
          profileName: undefined,
          id: record.Id, // Ensure the permission Id is set for PATCH
          parentId: record.Parent && (record.Parent.Id || (record.Parent.attributes && record.Parent.attributes.url && record.Parent.attributes.url.split('/').pop()))
        };
        if (!record.Id) {
          console.warn('FieldPermissions record missing Id:', record);
        }
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
      // After collecting permissions, sort them alphabetically by name
      permissions.profiles.sort((a, b) => a.name.localeCompare(b.name));
      permissions.permissionSets.sort((a, b) => a.name.localeCompare(b.name));
      // Attach raw records for POST logic
      permissions._rawRecords = records;
      return permissions;
    }
  
    createModal(fieldInfo, permissions) {
      // Remove existing modal if present
      const existingModal = document.getElementById('field-permissions-modal');
      if (existingModal) {
        existingModal.remove();
      }
  
      // Track modified permissions
      this.modifiedPermissions = {};
  
      // Try to get the object icon URL and background color from the page
      let objectIconHtml = '';
      try {
        const iconContainer = document.querySelector('.record-avatar-container');
        const iconImg = iconContainer ? iconContainer.querySelector('img') : null;
        let bgColor = '';
        if (iconContainer && iconContainer.style && iconContainer.style.backgroundColor) {
          bgColor = iconContainer.style.backgroundColor;
        }
        if (iconImg && iconImg.src) {
          objectIconHtml = `<span style="display:inline-block;width:24px;height:24px;vertical-align:middle;margin-right:8px;border-radius:4px;background:${bgColor};box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;"><img src="${iconImg.src}" alt="${fieldInfo.objectName}" style="width:24px;height:24px;vertical-align:middle;border-radius:4px;background:${bgColor};"></span>`;
        }
      } catch (e) {}
  
      const modal = document.createElement('div');
      modal.id = 'field-permissions-modal';
      modal.className = 'slds-modal slds-fade-in-open';
      modal.style.zIndex = '2147483647'; // Ensure modal is on top
      // Add fade-in class
      modal.classList.add('field-permissions-modal-fadein');
      modal.innerHTML = `
        <div class="slds-modal__container" style="z-index:2147483647;">
          <header class="slds-modal__header">
            <h2 class="slds-text-heading_medium">Field Permissions Inspector</h2>
            <button id="field-permissions-modal-close" class="slds-button slds-button_icon slds-modal__close" style="z-index:2147483647;">
              <span class="slds-button__icon">×</span>
            </button>
          </header>
          <div class="slds-modal__content slds-p-around_medium">
            <div class="field-info">
              <h3 class="slds-text-heading_small" style="display:flex;align-items:center;gap:6px;">${objectIconHtml}<b>${fieldInfo.objectName}</b>: ${fieldInfo.fieldName}</h3>
            </div>
            
            <div class="slds-tabs_default">
              <ul class="slds-tabs_default__nav" role="tablist">
                <li class="slds-tabs_default__item slds-is-active" role="presentation">
                  <a class="slds-tabs_default__link" href="#profiles-tab" role="tab">Profiles</a>
                </li>
                <li class="slds-tabs_default__item" role="presentation">
                  <a class="slds-tabs_default__link" href="#permsets-tab" role="tab">Permission Sets</a>
                </li>
                <li class="slds-tabs_default__item" role="presentation">
                  <a class="slds-tabs_default__link" href="#useraccess-tab" role="tab">User Access</a>
                </li>
              </ul>
              
              <div id="profiles-tab" class="slds-tabs_default__content slds-show" role="tabpanel">
                ${this.createPermissionsTable(permissions.profiles, 'profiles')}
              </div>
              
              <div id="permsets-tab" class="slds-tabs_default__content slds-hide" role="tabpanel">
                ${this.createPermissionsTable(permissions.permissionSets, 'permissionSets')}
              </div>
              <div id="useraccess-tab" class="slds-tabs_default__content slds-hide" role="tabpanel">
                ${this.createUserAccessTab(fieldInfo, permissions)}
              </div>
            </div>
          </div>
          <footer class="slds-modal__footer">
            <button id="field-permissions-save" class="slds-button slds-button_brand">Save</button>
          </footer>
        </div>
        <div class="slds-backdrop slds-backdrop_open" style="z-index:2147483646;"></div>
      `;
  
      document.body.appendChild(modal);
      // Trigger fade-in after appending
      requestAnimationFrame(() => {
        modal.classList.add('field-permissions-modal-fadein-active');
      });
      // Add event listener for close button
      const closeBtn = modal.querySelector('#field-permissions-modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          this.fadeOutAndRemoveModal();
        });
      }
      // Add event listener for save button
      const saveBtn = modal.querySelector('#field-permissions-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveModifiedPermissions(fieldInfo));
      }
      this.setupModalTabs(modal);
      this.setupPermissionCheckboxListeners();
      this.setupUserAccessTab(fieldInfo, permissions);
    }
  
    createPermissionsTable(permissions, type) {
      if (permissions.length === 0) {
        return '<p class="slds-text-color_weak">No permissions found</p>';
      }
      // Add select/deselect all checkboxes in the header
      const tableId = `field-permissions-table-${type}`;
      let tableHtml = `
        <table id="${tableId}" class="slds-table slds-table_bordered slds-table_cell-buffer field-permissions-table" data-type="${type}">
          <thead>
            <tr class="slds-line-height_reset">
              <th scope="col"><span class="slds-truncate">Name</span></th>
              <th scope="col">
                <span class="slds-truncate">Read</span>
                <input type="checkbox" class="field-permissions-select-all" data-col="read" data-table-id="${tableId}" title="Select/Deselect All Read" style="margin-left:6px;vertical-align:middle;">
              </th>
              <th scope="col">
                <span class="slds-truncate">Edit</span>
                <input type="checkbox" class="field-permissions-select-all" data-col="edit" data-table-id="${tableId}" title="Select/Deselect All Edit" style="margin-left:6px;vertical-align:middle;">
              </th>
            </tr>
          </thead>
          <tbody>
      `;
      permissions.forEach((perm, idx) => {
        // Use a unique id for each checkbox
        const rowId = `${type}-${idx}`;
        // Ensure perm.id is set for PATCH
        tableHtml += `
          <tr data-row-id="${rowId}" data-perm-id="${perm.id || perm.permId || ''}">
            <td><span class="slds-truncate">${perm.name}</span></td>
            <td><input type="checkbox" class="field-permissions-read" data-row-id="${rowId}" ${perm.read ? 'checked' : ''}></td>
            <td><input type="checkbox" class="field-permissions-edit" data-row-id="${rowId}" ${perm.edit ? 'checked' : ''}></td>
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
  
    setupPermissionCheckboxListeners() {
      // Listen for changes on all checkboxes in the modal
      const modal = document.getElementById('field-permissions-modal');
      if (!modal) return;
      const checkboxes = modal.querySelectorAll('.field-permissions-read, .field-permissions-edit');
      checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const rowId = e.target.getAttribute('data-row-id');
          const row = modal.querySelector(`tr[data-row-id="${rowId}"]`);
          if (!row) return;
          // Highlight the cell
          e.target.style.boxShadow = '0 0 0 2px #ffb75d';
          e.target.style.background = '#fff7e6';
          // Track the change
          if (!this.modifiedPermissions[rowId]) {
            this.modifiedPermissions[rowId] = {};
          }
          if (e.target.classList.contains('field-permissions-read')) {
            this.modifiedPermissions[rowId].read = e.target.checked;
          } else if (e.target.classList.contains('field-permissions-edit')) {
            this.modifiedPermissions[rowId].edit = e.target.checked;
          }
          // Store the permission record Id for saving
          this.modifiedPermissions[rowId].permId = row.getAttribute('data-perm-id');
        });
      });
      // Add select/deselect all listeners
      const selectAllCheckboxes = modal.querySelectorAll('.field-permissions-select-all');
      selectAllCheckboxes.forEach(selectAll => {
        selectAll.addEventListener('change', (e) => {
          const col = selectAll.getAttribute('data-col');
          const tableId = selectAll.getAttribute('data-table-id');
          const table = modal.querySelector(`#${tableId}`);
          if (!table) return;
          const colClass = col === 'read' ? '.field-permissions-read' : '.field-permissions-edit';
          const checkboxes = table.querySelectorAll(colClass);
          checkboxes.forEach(cb => {
            if (cb.checked !== selectAll.checked) {
              cb.checked = selectAll.checked;
              cb.dispatchEvent(new Event('change', { bubbles: true }));
            }
          });
        });
      });
    }
  
    fadeOutAndRemoveModal() {
      const modalEl = document.getElementById('field-permissions-modal');
      if (modalEl) {
        modalEl.classList.remove('field-permissions-modal-fadein', 'field-permissions-modal-fadein-active');
        modalEl.classList.add('field-permissions-modal-fadeout');
        setTimeout(() => { modalEl.remove(); }, 200);
      }
    }
  
    async saveModifiedPermissions(fieldInfo) {
      const modal = document.getElementById('field-permissions-modal');
      if (!modal) return;
      const saveBtn = modal.querySelector('#field-permissions-save');
      if (saveBtn) saveBtn.disabled = true;
      const updates = Object.entries(this.modifiedPermissions || {});
      console.log('[FieldPerm PATCH] this.modifiedPermissions:', this.modifiedPermissions);
      console.log('[FieldPerm PATCH] updates:', updates);
      if (updates.length === 0) {
        this.showError('No changes to save');
        if (saveBtn) saveBtn.disabled = false;
        return;
      }
      try {
        // Get the Salesforce my.salesforce.com domain from the current Lightning domain
        const lightningDomain = window.location.hostname;
        const myDomain = lightningDomain.replace('.lightning.force.com', '.my.salesforce.com');
        for (const [rowId, change] of updates) {
          if (!change.permId || typeof change.permId !== 'string') {
            console.warn('[FieldPerm PATCH/POST] Skipping row with invalid permId:', rowId, change);
            continue;
          }
          // PATCH if real FieldPermissions record, POST if virtual (000...)
          if (/^01k.{15,17}$/.test(change.permId)) {
            // PATCH existing FieldPermissions
            const apiUrl = `https://${myDomain}/services/data/v${this.apiVersion}/sobjects/FieldPermissions/${change.permId}`;
            const sessionId = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({ action: 'getSessionId', domain: myDomain }, (response) => {
                if (response && response.sessionId) {
                  resolve(response.sessionId);
                } else {
                  reject(response && response.error ? response.error : 'Failed to get sessionId');
                }
              });
            });
            let readVal = 'read' in change ? change.read : false;
            let editVal = 'edit' in change ? change.edit : false;
            // Enforce: Edit => Read must be true, and Read false => Edit false
            if (editVal) readVal = true;
            if (!readVal) editVal = false;
            const body = { PermissionsRead: readVal, PermissionsEdit: editVal };
            // Log the PATCH request
            console.log('[FieldPerm PATCH] Request:', { url: apiUrl, body });
            await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('PATCH', apiUrl, true);
              xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
              xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
              xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                  // Log the response
                  console.log('[FieldPerm PATCH] Response:', { status: xhr.status, response: xhr.responseText });
                  if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                  } else {
                    console.error('[FieldPerm PATCH] Error:', xhr.status, xhr.responseText);
                    reject(new Error('Failed to update permission: ' + xhr.status + ' ' + xhr.responseText));
                  }
                }
              };
              xhr.send(JSON.stringify(body));
            });
          } else if (/^000.{15,17}$/.test(change.permId)) {
            // POST new FieldPermissions for virtual/permission set
            // Find the row and get ParentId, Field
            const row = document.querySelector(`tr[data-row-id="${rowId}"]`);
            if (!row) {
              console.warn('[FieldPerm POST] Could not find row for virtual permission:', rowId, change);
              continue;
            }
            // Try to get ParentId and Field from the original record (stored in processPermissions)
            const permRecord = this.lastFieldPermissionsRecords?.find(r => r.Id === change.permId);
            if (!permRecord || !permRecord.Parent || !permRecord.Field) {
              console.warn('[FieldPerm POST] Could not find original record for virtual permission:', rowId, change);
              continue;
            }
            let parentId = permRecord.Parent.Id || permRecord.ParentId;
            if (!parentId && permRecord.Parent && permRecord.Parent.attributes && permRecord.Parent.attributes.url) {
              const urlParts = permRecord.Parent.attributes.url.split('/');
              parentId = urlParts[urlParts.length - 1];
            }
            const fieldApi = permRecord.Field;
            console.log('[FieldPerm POST] parentId:', parentId);
            console.log('[FieldPerm POST] fieldApi:', fieldApi);
            if (!parentId || !fieldApi) {
              console.warn('[FieldPerm POST] Missing ParentId or Field for POST:', permRecord);
              continue;
            }
            const apiUrl = `https://${myDomain}/services/data/v${this.apiVersion}/sobjects/FieldPermissions`;
            const sessionId = await new Promise((resolve, reject) => {
              chrome.runtime.sendMessage({ action: 'getSessionId', domain: myDomain }, (response) => {
                if (response && response.sessionId) {
                  resolve(response.sessionId);
                } else {
                  reject(response && response.error ? response.error : 'Failed to get sessionId');
                }
              });
            });
            let readVal = 'read' in change ? change.read : false;
            let editVal = 'edit' in change ? change.edit : false;
            // Enforce: Edit => Read must be true, and Read false => Edit false
            if (editVal) readVal = true;
            if (!readVal) editVal = false;
            const body = {
              ParentId: parentId,
              Field: fieldApi,
              SObjectType: fieldApi.split('.')[0],
              PermissionsRead: readVal,
              PermissionsEdit: editVal
            };
            // Log the POST request
            console.log('[FieldPerm POST] Request:', { url: apiUrl, body });
            await new Promise((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('POST', apiUrl, true);
              xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
              xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
              xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                  // Log the response
                  console.log('[FieldPerm POST] Response:', { status: xhr.status, response: xhr.responseText });
                  if (xhr.status >= 200 && xhr.status < 300) {
                    resolve();
                  } else {
                    console.error('[FieldPerm POST] Error:', xhr.status, xhr.responseText);
                    reject(new Error('Failed to create permission: ' + xhr.status + ' ' + xhr.responseText));
                  }
                }
              };
              xhr.send(JSON.stringify(body));
            });
          } else {
            console.warn('[FieldPerm PATCH/POST] Skipping row with unknown permId format:', rowId, change);
          }
        }
        this.showSuccess('Permissions updated successfully');
        // Remove highlights after save
        Object.keys(this.modifiedPermissions).forEach(rowId => {
          const modal = document.getElementById('field-permissions-modal');
          if (!modal) return;
          const row = modal.querySelector(`tr[data-row-id="${rowId}"]`);
          if (row) {
            row.querySelectorAll('td').forEach(td => {
              td.style.boxShadow = '';
              td.style.background = '';
            });
          }
        });
        this.modifiedPermissions = {};
        // Fade out and close the modal after success
        this.fadeOutAndRemoveModal();
      } catch (err) {
        this.showError('Failed to update permissions: ' + err.message);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    }
  
    showError(message) {
      this.showToast(message, 'error');
    }
  
    showSuccess(message) {
      this.showToast(message, 'success');
    }
  
    showToast(message, type) {
      const toast = document.createElement('div');
      toast.className = `field-permissions-toast field-permissions-toast-${type}`;
      toast.innerHTML = `
        <div class="field-permissions-toast-content">
          <span class="field-permissions-toast-icon">${type === 'success' ? '✔️' : '⚠️'}</span>
          <span class="field-permissions-toast-message">${message}</span>
        </div>
      `;
      document.body.appendChild(toast);
      // Animate in
      setTimeout(() => toast.classList.add('field-permissions-toast-in'), 10);
      // Animate out after 3s
      setTimeout(() => {
        toast.classList.remove('field-permissions-toast-in');
        toast.classList.add('field-permissions-toast-out');
        setTimeout(() => toast.remove(), 400);
      }, 3000);
    }

    createUserAccessTab(fieldInfo, permissions) {
      const users = permissions._allUsers || [];
      let userOptions = users.map(u => `<option value="${u.Id}">${u.Name} (${u.Username})</option>`).join('');
      return `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;">
          <select id="user-access-lookup" class="slds-input" style="flex:1;min-width:0;">
            <option value="">Select a user...</option>
            ${userOptions}
          </select>
          <button id="user-access-check" class="slds-button slds-button_neutral">Check</button>
          <span id="user-access-spinner" style="display:none;margin-left:8px;vertical-align:middle;"></span>
        </div>
        <div id="user-access-result"></div>
      `;
    }

    setupUserAccessTab(fieldInfo, permissions) {
      const modal = document.getElementById('field-permissions-modal');
      if (!modal) return;
      const checkBtn = modal.querySelector('#user-access-check');
      const userSelect = modal.querySelector('#user-access-lookup');
      const resultDiv = modal.querySelector('#user-access-result');
      const spinner = modal.querySelector('#user-access-spinner');
      if (!checkBtn || !userSelect || !resultDiv || !spinner) return;
      // Spinner SVG (same as icon spinner)
      spinner.innerHTML = `<svg width="16" height="16" viewBox="0 0 50 50"><circle cx="25" cy="25" r="20" fill="none" stroke="#0176d3" stroke-width="5" stroke-linecap="round" stroke-dasharray="31.415, 31.415" transform="rotate(72.3246 25 25)"><animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/></circle></svg>`;
      checkBtn.addEventListener('click', async () => {
        const userId = userSelect.value;
        if (!userId) {
          resultDiv.innerHTML = '<span style="color:#c23934;">Please select a user.</span>';
          return;
        }
        // Show spinner
        spinner.style.display = '';
        resultDiv.innerHTML = '';
        // Query user profile and permission sets
        try {
          const lightningDomain = window.location.hostname;
          const myDomain = lightningDomain.replace('.lightning.force.com', '.my.salesforce.com');
          const sessionId = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'getSessionId', domain: myDomain }, (response) => {
              if (response && response.sessionId) {
                resolve(response.sessionId);
              } else {
                reject(response && response.error ? response.error : 'Failed to get sessionId');
              }
            });
          });
          // Get user's profile and permission sets
          const userQuery = `SELECT Id, Name, ProfileId, Profile.Name, (SELECT PermissionSetId, PermissionSet.Name FROM PermissionSetAssignments) FROM User WHERE Id = '${userId}'`;
          const userUrl = `https://${myDomain}/services/data/v${this.apiVersion}/query/?q=${encodeURIComponent(userQuery)}`;
          const userResp = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', userUrl, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + sessionId);
            xhr.onreadystatechange = function () {
              if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                  resolve(JSON.parse(xhr.responseText));
                } else {
                  reject(new Error('Failed to query User: ' + xhr.status + ' ' + xhr.responseText));
                }
              }
            };
            xhr.send();
          });
          const user = userResp.records && userResp.records[0];
          if (!user) {
            resultDiv.innerHTML = '<span style="color:#c23934;">User not found.</span>';
            spinner.style.display = 'none';
            return;
          }
          // Check profile
          let hasProfileAccess = false;
          let profileName = user.Profile && user.Profile.Name;
          let profilePerm = (permissions.profiles || []).find(p => p.name === profileName);
          if (profilePerm && (profilePerm.read || profilePerm.edit)) {
            hasProfileAccess = true;
          }
          // Check permission sets
          let permSetAccess = [];
          let psaArr = [];
          if (user.PermissionSetAssignments) {
            psaArr = Array.isArray(user.PermissionSetAssignments) ? user.PermissionSetAssignments : (user.PermissionSetAssignments.records || []);
          }
          let userPermSetIds = psaArr.map(psa => psa.PermissionSetId);
          (permissions.permissionSets || []).forEach(ps => {
            if (userPermSetIds.includes(ps.parentId) && (ps.read || ps.edit)) {
              permSetAccess.push(ps.name);
            }
          });
          // Compose result
          if (hasProfileAccess || permSetAccess.length > 0) {
            resultDiv.innerHTML = `<span style="color:#2ecc40;font-weight:bold;">User has access to <b>${fieldInfo.objectName}.${fieldInfo.fieldName}</b></span><br>` +
              (hasProfileAccess ? `<div>Profile: <b>${profileName}</b></div>` : '') +
              (permSetAccess.length > 0 ? `<div>Permission Sets: <b>${permSetAccess.join(', ')}</b></div>` : '');
          } else {
            resultDiv.innerHTML = `<span style="color:#c23934;font-weight:bold;">User does NOT have access to <b>${fieldInfo.objectName}.${fieldInfo.fieldName}</b></span>`;
          }
        } catch (err) {
          resultDiv.innerHTML = `<span style="color:#c23934;">Error: ${err.message}</span>`;
        } finally {
          spinner.style.display = 'none';
        }
      });
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new SalesforceFieldInspector());
  } else {
    new SalesforceFieldInspector();
  }