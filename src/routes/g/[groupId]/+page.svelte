<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;

  const money = (cents) =>
    (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }
</script>

<h1>{data.group.name}</h1>
<p class="muted">Signed in as {data.me.name}</p>

<h2>Balances</h2>
<div class="card">
  {#each data.balances as b}
    <div class="row">
      <span>{b.name}{b.id === data.me.id ? ' (you)' : ''}</span>
      <span class={b.cents > 0 ? 'pos' : b.cents < 0 ? 'neg' : 'muted'}>
        {b.cents > 0 ? 'gets back ' : b.cents < 0 ? 'owes ' : 'settled '}
        {b.cents === 0 ? '' : money(Math.abs(b.cents))}
      </span>
    </div>
  {/each}
</div>

<h2>Settle up</h2>
<div class="card">
  {#if data.transfers.length === 0}
    <p class="muted">Everyone's even. 🎉</p>
  {:else}
    {#each data.transfers as t}
      <div class="row">
        <span><strong>{t.fromName}</strong> pays <strong>{t.toName}</strong></span>
        <span class="amt">{money(t.amountCents)}</span>
      </div>
    {/each}
  {/if}
</div>

<h2>Add expense</h2>
<form class="card" method="POST" action="?/addExpense" use:enhance>
  <label for="description">Description</label>
  <input id="description" name="description" placeholder="Groceries" autocomplete="off" />

  <label for="amount">Amount ($)</label>
  <input id="amount" name="amount" inputmode="decimal" placeholder="42.50" autocomplete="off" />

  <label for="paidById">Paid by</label>
  <select id="paidById" name="paidById">
    {#each data.members as m}
      <option value={m.id} selected={m.id === data.me.id}>{m.name}</option>
    {/each}
  </select>

  <span class="field-label">Split between</span>
  {#each data.members as m}
    <label style="display:flex; align-items:center; gap:10px; color:var(--text); margin:6px 0;">
      <input
        type="checkbox"
        name="participants"
        value={m.id}
        checked
        style="width:auto; flex:0 0 auto;"
      />
      {m.name}
    </label>
  {/each}

  {#if form?.addError}<p class="error">{form.addError}</p>{/if}
  <button type="submit">Add expense</button>
</form>

<h2>Record a payment</h2>
<form class="card" method="POST" action="?/settle" use:enhance>
  <label for="fromId">From</label>
  <select id="fromId" name="fromId">
    {#each data.members as m}
      <option value={m.id} selected={m.id === data.me.id}>{m.name}</option>
    {/each}
  </select>

  <label for="toId">To</label>
  <select id="toId" name="toId">
    {#each data.members as m}
      <option value={m.id}>{m.name}</option>
    {/each}
  </select>

  <label for="settleAmount">Amount ($)</label>
  <input id="settleAmount" name="amount" inputmode="decimal" placeholder="10.00" autocomplete="off" />

  {#if form?.settleError}<p class="error">{form.settleError}</p>{/if}
  <button type="submit">Record payment</button>
</form>

<h2>Expenses</h2>
<div class="card">
  {#if data.expenses.length === 0}
    <p class="muted">No expenses yet.</p>
  {:else}
    {#each data.expenses as e}
      <div class="row">
        <span>{e.description}<br /><span class="muted">paid by {e.paidByName}</span></span>
        <span style="display:flex; align-items:center; gap:12px;">
          <span class="amt">{money(e.amountCents)}</span>
          <form method="POST" action="?/deleteExpense" use:enhance>
            <input type="hidden" name="expenseId" value={e.id} />
            <button
              type="submit"
              title="Delete"
              style="width:auto; margin:0; padding:6px 10px; background:transparent; border:1px solid var(--border); color:var(--muted);"
              >✕</button
            >
          </form>
        </span>
      </div>
    {/each}
  {/if}
</div>

{#if data.settlements.length > 0}
  <h2>Payment history</h2>
  <div class="card">
    {#each data.settlements as s}
      <div class="row">
        <span>{s.fromName} → {s.toName}</span>
        <span class="amt">{money(s.amountCents)}</span>
      </div>
    {/each}
  </div>
{/if}

<h2>Invite housemates</h2>
<div class="card">
  <p class="muted" style="margin-top:0;">Anyone with this link can join the group.</p>
  <div class="linkbox">
    <input readonly value={data.inviteUrl} />
    <button type="button" class="btn-ghost" on:click={() => copy(data.inviteUrl)}>Copy</button>
  </div>

  <p class="muted">Your personal sign-in link — open it on another device to log in as you. Keep it private.</p>
  <div class="linkbox">
    <input readonly value={data.myLoginUrl} />
    <button type="button" class="btn-ghost" on:click={() => copy(data.myLoginUrl)}>Copy</button>
  </div>
</div>
