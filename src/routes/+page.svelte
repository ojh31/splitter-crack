<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;

  const money = (cents) =>
    (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);
</script>

<h1>Split bills with your housemates</h1>
<p class="muted">Create a group, share the invite link, and let everyone log expenses. No passwords.</p>

{#if data.groups.length > 0}
  <h2>Your groups</h2>
  <div class="card">
    {#each data.groups as g}
      <a class="row grouprow" href={`/g/${g.id}`}>
        <span>
          {g.name}<br />
          <span class="muted">{g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}</span>
        </span>
        <span class={g.myBalanceCents > 0 ? 'pos' : g.myBalanceCents < 0 ? 'neg' : 'muted'}>
          {#if g.myBalanceCents > 0}you're owed {money(g.myBalanceCents)}
          {:else if g.myBalanceCents < 0}you owe {money(-g.myBalanceCents)}
          {:else}settled{/if}
        </span>
      </a>
    {/each}
  </div>
{/if}

<h2>New group</h2>
<form class="card" method="POST" action="?/create" use:enhance>
  <label for="groupName">Group name</label>
  <input id="groupName" name="groupName" placeholder="Flat 3B" autocomplete="off" />

  <label for="yourName">Your name</label>
  <input id="yourName" name="yourName" placeholder="Oskar" autocomplete="off" />

  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <button type="submit">Create group</button>
</form>

{#if data.loginUrl}
  <h2>Sign in on another device</h2>
  <div class="card">
    <p class="muted" style="margin-top:0;">
      Open this link on your phone or another browser to access all your groups. Keep it private.
    </p>
    <div class="linkbox">
      <input readonly value={data.loginUrl} />
      <button
        type="button"
        class="btn-ghost"
        on:click={() => navigator.clipboard?.writeText(data.loginUrl)}>Copy</button
      >
    </div>
  </div>
{/if}
