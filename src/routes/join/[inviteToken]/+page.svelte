<script>
  import { enhance } from '$app/forms';
  export let data;
  export let form;
</script>

<h1>Join {data.groupName}</h1>
<p class="muted">Pick the name your housemates will see.</p>

<form class="card" method="POST" use:enhance>
  <label for="name">Your name</label>
  <input id="name" name="name" placeholder="Oskar" autocomplete="off" />
  {#if form?.error}<p class="error">{form.error}</p>{/if}
  <button type="submit">Join group</button>
</form>
