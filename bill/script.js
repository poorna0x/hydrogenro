if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.error('Service Worker failed', err));
  });
}

const lastValid = new WeakMap();

function addItem() {
  const itemsDiv = document.getElementById('items');
  const div = document.createElement('div');
  div.classList.add('item-row');
  div.dataset.type = 'item';
  div.innerHTML = `
    <input type="text" placeholder="Item Name" class="item-name" required>
    <input type="text" placeholder="Qty" class="qty" value="">
    <input type="text" placeholder="Rate" class="rate" value="">
    <button type="button" class="remove-btn" onclick="removeItem(this)">x</button>
  `;
  itemsDiv.appendChild(div);
  attachListeners(div);
  updatePreview();
}

function addAdditional() {
  const itemsDiv = document.getElementById('items');
  const div = document.createElement('div');
  div.classList.add('item-row');
  div.dataset.type = 'additional';
  div.innerHTML = `
    <input type="text" placeholder="Description" class="item-name" required>
    <input type="text" placeholder="Qty" class="qty" value="NA" readonly style="background:#eee; text-align:center;">
    <input type="text" placeholder="Rate" class="rate" value="NA" readonly style="background:#eee; text-align:center;">
    <input type="text" placeholder="Price" class="price" value="">
    <button type="button" class="remove-btn" onclick="removeItem(this)">x</button>
  `;
  itemsDiv.appendChild(div);
  attachListeners(div);
  updatePreview();
}

function removeItem(btn) {
  btn.parentElement.remove();
  updatePreview();
}

function attachListeners(row) {
  row.querySelectorAll('input').forEach(input => {
    if (['qty','rate','price'].some(c => input.classList.contains(c))) {
      lastValid.set(input, '');
      input.addEventListener('input', () => {
        const val = input.value;
        if (val === '') { lastValid.set(input, ''); updatePreview(); return; }
        if (/^[1-9]\d*$/.test(val)) {
          lastValid.set(input, val);
        } else {
          input.value = lastValid.get(input);
        }
        updatePreview();
      });
    } else if (input.classList.contains('item-name')) {
      input.addEventListener('input', () => {
        updatePreview(); // Allow spaces exactly as typed
      });
    }
  });
}

function isValidPositiveInt(v) {
  return /^[1-9]\d*$/.test(v);
}

function updatePreview() {
  const name = document.getElementById('customerName').value; // no trim
  const phone = document.getElementById('customerPhone').value; // no trim

  document.getElementById('billTo').textContent =
    name ? `Bill To: ${name}${phone ? ' ('+phone+')' : ''}` : '';
  document.getElementById('billDate').textContent =
    `Date: ${new Date().toLocaleDateString()}`;

  const tbody = document.querySelector('#itemsTable tbody');
  tbody.innerHTML = '';
  let subtotal = 0;

  document.querySelectorAll('#items .item-row').forEach(row => {
    const type = row.dataset.type;
    const desc = row.querySelector('.item-name').value; // no trim

    if (!desc) return;

    if (type==='item') {
      const q = row.querySelector('.qty').value.trim();
      const r = row.querySelector('.rate').value.trim();
      const qv = isValidPositiveInt(q), rv = isValidPositiveInt(r);
      let amt = '';
      if (qv && rv) {
        amt = parseInt(q)*parseInt(r);
        subtotal += amt;
      }
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td style="white-space: pre;">${desc}</td>
          <td>${qv?q:''}</td>
          <td>${rv?r:''}</td>
          <td>${amt!==''?amt:''}</td>
        </tr>
      `);
    } else {
      const p = row.querySelector('.price').value.trim();
      const pv = isValidPositiveInt(p);
      if (pv) subtotal += parseInt(p);
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td style="white-space: pre;">${desc}</td>
          <td>NA</td>
          <td>NA</td>
          <td>${pv?p:''}</td>
        </tr>
      `);
    }
  });

  const dv = document.getElementById('discountValue').value.trim();
  const dt = document.getElementById('discountType').value;
  let discountAmount = 0;
  if (dv!=='') {
    const val = parseInt(dv);
    if (!isNaN(val) && val>=0) {
      discountAmount = dt==='percent'
        ? Math.floor(subtotal*val/100)
        : val > subtotal ? subtotal : val;
      if (discountAmount>subtotal) discountAmount = subtotal;
    }
  }

  document.getElementById('subtotal').textContent = subtotal>0?subtotal:'';
  
  const discountRow = document.getElementById('discountRow');
  if (discountAmount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('discountAmount').textContent = discountAmount;
  } else {
    discountRow.style.display = 'none';
  }
  
  const grand = subtotal - discountAmount;
  document.getElementById('grandTotal').textContent = grand>0?grand:'';
}

function generatePDF() {
  updatePreview();
  
  const missingDesc = Array.from(document.querySelectorAll('#items .item-row[data-type="item"] .item-name'))
    .some(input => input.value === '');
  
  if (missingDesc) {
    alert('Please fill all item descriptions before generating the bill.');
    return;
  }

  const invoice = document.getElementById('invoice');
  html2canvas(invoice, { scale: 2 }).then(canvas => {
    const img = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const w = pdf.internal.pageSize.getWidth(), h = pdf.internal.pageSize.getHeight();
    const pxToMm = 0.264583, margin=5;
    const imgW = w - margin*2;
    const imgH = (canvas.height*pxToMm)*(imgW/(canvas.width*pxToMm));
    if (imgH < h - margin*2) {
      pdf.addImage(img,'PNG',margin,margin,imgW,imgH);
    } else {
      let leftH=imgH, y=0;
      while (leftH>0) {
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        const maxHPx = ((h-margin*2)/pxToMm)*(canvas.width*pxToMm)/imgW;
        pageCanvas.height = Math.min(canvas.height-y, maxHPx);
        const ctx = pageCanvas.getContext('2d');
        ctx.drawImage(canvas,0,y,canvas.width,pageCanvas.height,0,0,canvas.width,pageCanvas.height);
        const pageImg = pageCanvas.toDataURL('image/png');
        const pageImgH = (pageCanvas.height*pxToMm)*(imgW/(canvas.width*pxToMm));
        pdf.addImage(pageImg,'PNG',margin,margin,imgW,pageImgH);
        y += pageCanvas.height;
        leftH -= pageImgH;
        if (leftH>0) pdf.addPage();
      }
    }
    
    let custName = document.getElementById('customerName').value;
    custName = custName ? custName.replace(/\s+/g,'_') : 'ROSERVICE_BILL';
    pdf.save(`${custName}.pdf`);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#items .item-row').forEach(attachListeners);
  document.getElementById('customerName').addEventListener('input', updatePreview);
  document.getElementById('discountValue').addEventListener('input', updatePreview);
  document.getElementById('discountType').addEventListener('change', updatePreview);
  document.getElementById('customerPhone').addEventListener('input', updatePreview);
  updatePreview();
});
